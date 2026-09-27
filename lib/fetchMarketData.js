import axios from 'axios';
import * as cheerio from 'cheerio';
import { config } from './config.js';

/**
 * Market data adapter.
 *
 * Order of attempts:
 *   1. Apify actor (if APIFY_TOKEN is set) — structured JSON, no HTML parsing
 *   2. Public page scraper — fallback if Apify isn't configured or fails
 *   3. Empty snapshot — pipeline still runs, Gemini/frontend just say prices
 *      were unavailable rather than crashing
 *
 * Whatever source is used, keep the return shape below the same so the rest
 * of the pipeline (API routes, Gemini prompt, Telegram formatting) doesn't
 * need to change.
 *
 * Return shape:
 * {
 *   asOf: string,                 // timestamp of the data
 *   quotes: {                     // keyed by ticker
 *     [ticker]: { price: number, changePct: number, volume?: number }
 *   },
 *   topGainers: [{ ticker, changePct }],
 *   topLosers: [{ ticker, changePct }],
 * }
 */
export async function getMarketSnapshot(tickers) {
  if (config.apify?.token) {
    try {
      return await fetchFromApify(tickers || []);
    } catch (err) {
      console.error('[fetchMarketData] Apify fetch failed, falling back to scraper:', err.message);
    }
  }

  try {
    return await scrapePublicSummary();
  } catch (err) {
    console.error('[fetchMarketData] scrape failed, falling back to empty snapshot:', err.message);
    return { asOf: new Date().toISOString(), quotes: {}, topGainers: [], topLosers: [] };
  }
}

/**
 * Apify actor integration — mansalabs/african-stock-market-data.
 * Docs: https://apify.com/mansalabs/african-stock-market-data
 *
 * Confirmed input schema (from the actor's OpenAPI spec):
 *   { dataset: "exchanges"|"stocks"|"quote"|"history"|"movers"|"indices"|"search",
 *     exchangeCode: string,   // e.g. "NSE" for Kenya — NOT "exchange"
 *     tickers: string[] }     // for dataset: "quote" / "history"
 *
 * We make two calls: "movers" for today's gainers/losers, and "quote" (with
 * our tracked tickers) so portfolio/watchlist holdings always get a price
 * even if they're not among today's biggest movers.
 *
 * The exact shape of each dataset ITEM isn't published, so normalizeQuote()
 * below tries several likely field names. If quotes still come back empty
 * after this fix, check the logs for the sample item they print, or open
 * the run in Apify Console (console.apify.com → Actors → Runs) and compare
 * its real field names against normalizeQuote().
 */
async function fetchFromApify(tickers) {
  const { token, actorId, exchangeCode } = config.apify;
  const url = `https://api.apify.com/v2/actors/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`;

  const runDataset = async (input) => {
    try {
      const { data } = await axios.post(url, input, { params: { token }, timeout: 30000 });
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error(`[fetchMarketData] Apify dataset "${input.dataset}" call failed:`, err.response?.data || err.message);
      return [];
    }
  };

  const [moversItems, quoteItems] = await Promise.all([
    runDataset({ dataset: 'movers', exchangeCode }),
    tickers.length ? runDataset({ dataset: 'quote', exchangeCode, tickers }) : Promise.resolve([]),
  ]);

  const allItems = [...quoteItems, ...moversItems]; // quoteItems first so they win on ticker collisions
  if (allItems.length === 0) {
    throw new Error(
      `Apify returned no items for exchangeCode "${exchangeCode}". Try running { "dataset": "exchanges" } manually in Apify Console to confirm the correct code.`
    );
  }

  const quotes = {};
  const seenForMovers = new Set();
  const movers = [];

  for (const raw of allItems) {
    const q = normalizeQuote(raw);
    if (!q.ticker) continue;
    if (!quotes[q.ticker]) quotes[q.ticker] = { price: q.price, changePct: q.changePct, volume: q.volume };
    if (q.changePct !== undefined && !seenForMovers.has(q.ticker)) {
      seenForMovers.add(q.ticker);
      movers.push({ ticker: q.ticker, changePct: q.changePct });
    }
  }

  if (Object.keys(quotes).length === 0) {
    console.warn(
      '[fetchMarketData] Apify returned items but none matched expected field names. Sample item:',
      JSON.stringify(allItems[0]).slice(0, 500)
    );
  }

  movers.sort((a, b) => b.changePct - a.changePct);

  return {
    asOf: new Date().toISOString(),
    quotes,
    topGainers: movers.slice(0, 5),
    topLosers: movers.slice(-5).reverse(),
  };
}

function normalizeQuote(raw) {
  const ticker = firstString(raw.ticker, raw.symbol, raw.code, raw.tickerSymbol)?.toUpperCase();
  const price = firstNumber(raw.price, raw.lastPrice, raw.last, raw.close);
  const changePct = firstNumber(raw.changePercent, raw.changePct, raw.pctChange, raw.percentChange, raw.change_percent);
  const volume = firstNumber(raw.volume, raw.vol, raw.tradedVolume);
  return { ticker, price, changePct, volume };
}

function firstString(...vals) {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim();
  return undefined;
}

function firstNumber(...vals) {
  for (const v of vals) {
    const n = typeof v === 'string' ? parseFloat(v.replace(/[%,]/g, '')) : v;
    if (typeof n === 'number' && !Number.isNaN(n)) return n;
  }
  return undefined;
}

/**
 * Fallback: scrape a public NSE summary page directly. Fragile by design —
 * depends on the target page's HTML structure, which can change without
 * notice. Also respect that page's terms of use before scraping it on a
 * schedule; this exists so the pipeline still works if Apify isn't set up.
 */
async function scrapePublicSummary() {
  const { data: html } = await axios.get(config.marketDataUrl, {
    timeout: 15000,
    headers: { 'User-Agent': 'SavannahMarket-PersonalBot/1.0' },
  });
  const $ = cheerio.load(html);

  const quotes = {};
  const movers = [];

  $('table tr').each((_, row) => {
    const cells = $(row).find('td').map((__, td) => $(td).text().trim()).get();
    if (cells.length < 3) return;

    const ticker = cells[0].toUpperCase();
    const priceCell = cells.find((c) => /^\d+(\.\d+)?$/.test(c.replace(/,/g, '')));
    const pctCell = cells.find((c) => /-?\d+(\.\d+)?%/.test(c));
    if (!ticker || !priceCell) return;

    const price = parseFloat(priceCell.replace(/,/g, ''));
    const changePct = pctCell ? parseFloat(pctCell.replace('%', '')) : undefined;

    quotes[ticker] = { price, changePct };
    if (changePct !== undefined) movers.push({ ticker, changePct });
  });

  movers.sort((a, b) => b.changePct - a.changePct);

  return {
    asOf: new Date().toISOString(),
    quotes,
    topGainers: movers.slice(0, 5),
    topLosers: movers.slice(-5).reverse(),
  };
}
