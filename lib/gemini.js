import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';

function buildPrompt({ enrichedHoldings, totals, snapshot, watchlist }) {
  const holdingsBlock = enrichedHoldings
    .map((h) => {
      const price = h.currentPrice != null ? `KES ${h.currentPrice}` : 'price unavailable';
      const pl = h.gainLossPct != null ? `${h.gainLossPct.toFixed(1)}%` : 'n/a';
      return `- ${h.ticker} (${h.name}): ${h.shares} shares @ avg cost KES ${h.purchasePrice}, current ${price}, unrealized P/L ${pl}`;
    })
    .join('\n');

  const gainersBlock = snapshot.topGainers
    .map((g) => `- ${g.ticker}: +${g.changePct}%`)
    .join('\n') || '(no gainer data available today)';

  const losersBlock = snapshot.topLosers
    .map((l) => `- ${l.ticker}: ${l.changePct}%`)
    .join('\n') || '(no loser data available today)';

  return `You are a financial analyst assistant for a Kenyan retail investor using the Nairobi Securities Exchange (NSE). Write a concise daily briefing in plain text suitable for a Telegram message (use simple "-" bullets, no markdown tables, no headers deeper than a single line in CAPS).

DATA AS OF: ${snapshot.asOf}

CURRENT HOLDINGS:
${holdingsBlock || '(no holdings on file)'}

PORTFOLIO TOTALS:
- Total cost basis: KES ${totals.totalCost.toFixed(2)}
- Total current value: KES ${totals.totalValue.toFixed(2)}
- Unrealized P/L: KES ${totals.totalGainLoss.toFixed(2)} (${totals.totalGainLossPct?.toFixed(1) ?? 'n/a'}%)
- Priced ${totals.pricedHoldings}/${totals.totalHoldings} holdings (others had no live price today)

TODAY'S TOP GAINERS ON THE NSE:
${gainersBlock}

TODAY'S TOP LOSERS ON THE NSE:
${losersBlock}

WATCHLIST TO CONSIDER FOR NEW OPPORTUNITIES: ${watchlist.join(', ')}

Write the briefing with these sections, in this order:
1. PORTFOLIO SNAPSHOT — one short paragraph on how the holdings are doing overall.
2. HOLDINGS TO WATCH — flag any specific holding that moved sharply or looks worth a second look, with a one-line reason each. If nothing stands out, say so.
3. OPPORTUNITIES TO EXPLORE — up to 3 ideas drawn from today's movers or the watchlist, each with a one-line reason. Do not recommend anything not present in the data above.
4. RISK NOTE — one line on the biggest risk or uncertainty right now.

End with exactly this line on its own:
"Informational only — not financial advice. Verify prices before acting."

Keep the whole message under 350 words. Do not invent prices, percentages, or news not present in the data above.`;
}

export async function generateInvestmentReport({ enrichedHoldings, totals, snapshot, watchlist }) {
  const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  const model = genAI.getGenerativeModel({ model: config.gemini.model });

  const prompt = buildPrompt({ enrichedHoldings, totals, snapshot, watchlist });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}
