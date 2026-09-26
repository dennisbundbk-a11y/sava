import axios from 'axios';
import * as cheerio from 'cheerio';
import { config } from './config.js';

/**
 * Market data adapter.
 *
 * Order of attempts:
 *   1. Apify actor (if APIFY_TOKEN is set) — structured JSON, no HTML parsing
 *   2. Public page scraper — fallback if Apify isn't configured or fails
 *   3. Empty snapshot — pipeline still runs, Gemini just says prices were
 *      unavailable rather than crashing the whole briefing
 *
 * Whatever source is used, keep the return shape below the same so the rest
 * of the pipeline (Gemini prompt + Telegram formatting) doesn't need to change.
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
      return await fetchFromApify();
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
 * Apify actor integration.
 *
 * Default actor: mansalabs/african-stock-market-data — covers 15+ African
 * exchanges including the NSE. Docs: https://apify.com/mansalabs/african-stock-market-data
 *
 * IMPORTANT — verify before relying on this: Apify's public docs pages don't
 * show a fully worked example of the response shape, so the field names
 * guessed in normalizeQuote() below are best-effort. The FIRST time you run
 * this (npm run once, or hit /api/cron/briefing manually), check the logs —
 * if quotes come back empty, open the actor's run in Apify Console
 * (console.apify.com → Actors → Runs), look at one raw dataset item, and
 * update the field names in normalizeQuote() to match what you actually see.
 *
 * If this actor's NSE coverage or field shape doesn't work out, an
 * alternative built specifically for NSE Kenya (returns gainers/losers/
 * most-active directly) is wafspaul/nse-kenya-market-data — swap ACTOR_ID
 * below and adjust the input object accordingly.
 */
const APIFY_ACTOR_INPUT = { dataset: 'quote', exchange: 'NSE' };

async function fetchFromApify() {
  const { token, actorId } = config.apify;
  const url = `https://api.apify.com/v2/actors/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`;

  const { data: items } = await axios.post(url, APIFY_ACTOR_INPUT, {
    params: { token },
    timeout: 30000,
  });

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(
      'Apify actor returned no items. Check the run in Apify Console and confirm the "exchange" code — try { "dataset": "exchanges" } as input to list valid codes.'
    );
  }

  const quotes = {};
  const movers = [];

  for (const raw of items) {
    const q = normalizeQuote(raw);
    if (!q || !q.ticker) continue;
    quotes[q.ticker] = { price: q.price, changePct: q.changePct, volume: q.volume };
    if (q.changePct !== undefined) movers.push({ ticker: q.ticker, changePct: q.changePct });
  }

  if (Object.keys(quotes).length === 0) {
    console.warn(
      '[fetchMarketData] Apify returned items but none matched expected field names. ' +
      'Sample item:', JSON.stringify(items[0]).slice(0, 500)
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
