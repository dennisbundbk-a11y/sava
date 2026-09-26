import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getMarketSnapshot } from './fetchMarketData.js';
import { enrichHoldings, portfolioTotals } from './portfolioMath.js';
import { generateInvestmentReport } from './gemini.js';
import { sendTelegramMessage } from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

async function loadJson(file) {
  const raw = await fs.readFile(path.join(dataDir, file), 'utf-8');
  return JSON.parse(raw);
}

export async function runBriefing() {
  const portfolio = await loadJson('portfolio.json');
  const watchlist = await loadJson('watchlist.json');
  const tickers = [...new Set([...portfolio.map((h) => h.ticker), ...watchlist])];

  const snapshot = await getMarketSnapshot(tickers);
  const enrichedHoldings = enrichHoldings(portfolio, snapshot.quotes);
  const totals = portfolioTotals(enrichedHoldings);

  const report = await generateInvestmentReport({ enrichedHoldings, totals, snapshot, watchlist });

  await sendTelegramMessage(`SAVANNAH MARKET — DAILY BRIEFING\n\n${report}`);

  return { sentAt: new Date().toISOString(), pricedHoldings: totals.pricedHoldings, totalHoldings: totals.totalHoldings };
}
