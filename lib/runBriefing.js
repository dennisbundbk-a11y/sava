import { createRequire } from 'node:module';

import { getMarketSnapshot } from './fetchMarketData.js';
import { enrichHoldings, portfolioTotals } from './portfolioMath.js';
import { generateInvestmentReport } from './gemini.js';
import { sendTelegramMessage } from './telegram.js';

// Static require() (not fs.readFile) so Vercel's build-time file tracer
// actually bundles these JSON files into the deployed function.
const require = createRequire(import.meta.url);
const portfolio = require('../data/portfolio.json');
const watchlist = require('../data/watchlist.json');

export async function runBriefing() {
  const tickers = [...new Set([...portfolio.map((h) => h.ticker), ...watchlist])];

  const snapshot = await getMarketSnapshot(tickers);
  const enrichedHoldings = enrichHoldings(portfolio, snapshot.quotes);
  const totals = portfolioTotals(enrichedHoldings);

  const report = await generateInvestmentReport({ enrichedHoldings, totals, snapshot, watchlist });

  await sendTelegramMessage(`SAVANNAH MARKET — DAILY BRIEFING\n\n${report}`);

  return { sentAt: new Date().toISOString(), pricedHoldings: totals.pricedHoldings, totalHoldings: totals.totalHoldings };
}
