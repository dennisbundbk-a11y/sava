import { createRequire } from 'node:module';
import { getMarketSnapshot } from '../lib/fetchMarketData.js';

// Static require() (not fs.readFile) so Vercel's build-time file tracer
// actually bundles these JSON files into the deployed function. A dynamic
// fs.readFile(path.join(...)) call at runtime is NOT detected by that
// tracer and silently fails to find the file in production.
const require = createRequire(import.meta.url);
const portfolio = require('../data/portfolio.json');
const watchlist = require('../data/watchlist.json');

// Public, read-only endpoint the website's frontend calls directly — no
// Gemini or Telegram credentials involved here, just market data. Returns:
// { asOf, quotes: { [ticker]: { price, changePct, volume } }, topGainers, topLosers }
export default async function handler(req, res) {
  try {
    const tickers = [...new Set([...portfolio.map((h) => h.ticker), ...watchlist])];
    const snapshot = await getMarketSnapshot(tickers);

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.status(200).json(snapshot);
  } catch (err) {
    console.error('[api/market-snapshot] failed:', err);
    res.status(500).json({ error: err.message });
  }
}
