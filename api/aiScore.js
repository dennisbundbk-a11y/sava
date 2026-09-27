import { getMarketSnapshot } from '../lib/fetchMarketData.js';
import { generateAiScore } from '../lib/aiScore.js';

// GET /api/ai-score?ticker=SCOM
// Public, read-only endpoint the website's frontend calls directly. Holds
// the Gemini key server-side — never exposed to the browser.
export default async function handler(req, res) {
  const ticker = String(req.query.ticker || 'SCOM').toUpperCase();

  try {
    const snapshot = await getMarketSnapshot([ticker]);
    const quote = snapshot.quotes[ticker] || null;
    const result = await generateAiScore(ticker, quote);

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json({ ticker, quote, asOf: snapshot.asOf, ...result });
  } catch (err) {
    console.error('[api/ai-score] failed:', err);
    res.status(500).json({ error: err.message });
  }
}
