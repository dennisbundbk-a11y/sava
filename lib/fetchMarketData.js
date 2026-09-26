import axios from 'axios';
import * as cheerio from 'cheerio';
import { config } from './config.js';

/**
 * Market data adapter.
 *
 * IMPORTANT: The Savannah Market spec explicitly calls for respecting NSE
 * market-data licensing. Before relying on this in anything beyond personal,
 * low-frequency use, replace `scrapePublicSummary` with a call to a licensed
 * or paid data provider (e.g. the NSE's own data feed, or a vendor like
 * Trading212/Refinitiv-style aggregators that cover the NSE). The scraper
 * below is a best-effort fallback only:
 *   - it depends on the target page's HTML structure, which can change
 *     without notice and silently break this function
 *   - you are responsible for checking that page's terms of use before
 *     scraping it on a schedule
 *
 * Whatever source you use, keep the return shape below the same so the rest
 * of the pipeline (Gemini prompt + Telegram formatting) doesn't need to change.
 *
 * Return shape:
 * {
 *   asOf: string,                 // human-readable timestamp/date of the data
 *   quotes: {                     // keyed by ticker
 *     [ticker]: { price: number, changePct: number, volume?: number }
 *   },
 *   topGainers: [{ ticker, changePct }],
 *   topLosers: [{ ticker, changePct }],
 * }
 */
export async function getMarketSnapshot(tickers) {
  try {
    return await scrapePublicSummary(tickers);
  } catch (err) {
    console.error('[fetchMarketData] scrape failed, falling back to empty snapshot:', err.message);
    // Fail soft: Gemini can still comment on holdings using stale/portfolio
    // data alone, and the report will say live prices were unavailable.
    return { asOf: new Date().toISOString(), quotes: {}, topGainers: [], topLosers: [] };
  }
}

async function scrapePublicSummary(tickers) {
  const { data: html } = await axios.get(config.marketDataUrl, {
    timeout: 15000,
    headers: { 'User-Agent': 'SavannahMarket-PersonalBot/1.0' },
  });
  const $ = cheerio.load(html);

  const quotes = {};
  const movers = [];

  // Generic heuristic: look for table rows where the first cell looks like
  // a ticker (short, uppercase) and later cells look like a price and a
  // percentage change. Verify against the live page and adjust the column
  // indices below if this doesn't match.
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
