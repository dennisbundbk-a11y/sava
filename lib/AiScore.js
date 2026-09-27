import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';

function buildPrompt(ticker, quote) {
  const quoteLine = quote && quote.price != null
    ? `Current price: KES ${quote.price}, change today: ${quote.changePct ?? 'n/a'}%, volume: ${quote.volume ?? 'n/a'}.`
    : 'Live price data is not currently available for this ticker — factor scores and confidence should reflect that uncertainty.';

  return `You are an investment analysis assistant for the Nairobi Securities Exchange (NSE). Analyze the stock with ticker "${ticker}" using ONLY the data below plus your general knowledge of this company. Do not invent specific financial figures (revenue, EPS, etc.) that aren't given to you.

${quoteLine}

Respond with ONLY a JSON object — no markdown code fences, no extra text before or after — matching exactly this shape:
{
  "score": <integer 0-100>,
  "recommendation": "<Strong Buy|Buy|Hold|Sell|Strong Sell>",
  "confidence": <integer 0-100>,
  "summary": "<2-3 sentence plain-language explanation a retail investor can understand>",
  "factors": [
    { "name": "<short factor name, 1-3 words>", "value": <integer 0-100> }
  ]
}
Include between 4 and 6 factors (e.g. momentum, market sentiment, liquidity, valuation context). If live price data was unavailable, say so plainly in the summary and lower the confidence score accordingly.`;
}

export async function generateAiScore(ticker, quote) {
  const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  const model = genAI.getGenerativeModel({ model: config.gemini.model });

  const prompt = buildPrompt(ticker, quote);
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const cleaned = text.replace(/^```(json)?\s*/i, '').replace(/```\s*$/, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.score !== 'number' || !Array.isArray(parsed.factors)) {
      throw new Error('missing expected fields');
    }
    return parsed;
  } catch (err) {
    throw new Error(`Gemini did not return valid JSON for ${ticker}: ${text.slice(0, 200)}`);
  }
}
