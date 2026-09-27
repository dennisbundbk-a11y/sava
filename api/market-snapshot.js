import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMarketSnapshot } from '../lib/fetchMarketData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Public, read-only endpoint the website's frontend calls directly — no
// Gemini or Telegram credentials involved here, just market data. Returns:
// { asOf, quotes: { [ticker]: { price, changePct, volume } }, topGainers, topLosers }
export default async function handler(req, res) {
  try {
    const [portfolioRaw, watchlistRaw] = await Promise.all([
      fs.readFile(path.join(__dirname, '..', 'data', 'portfolio.json'), 'utf-8'),
      fs.readFile(path.join(__dirname, '..', 'data', 'watchlist.json'), 'utf-8'),
    ]);
    const portfolio = JSON.parse(portfolioRaw);
    const watchlist = JSON.parse(watchlistRaw);
    const tickers = [...new Set([...portfolio.map((h) => h.ticker), ...watchlist])];

    const snapshot = await getMarketSnapshot(tickers);

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.status(200).json(snapshot);
  } catch (err) {
    console.error('[api/market-snapshot] failed:', err);
    res.status(500).json({ error: err.message });
  }
}
