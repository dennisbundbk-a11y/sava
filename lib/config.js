import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value || value.startsWith('your_')) {
    throw new Error(
      `Missing required env var: ${name}. Set it in Vercel's Project Settings → Environment Variables (or in .env for local runs).`
    );
  }
  return value;
}

export const config = {
  gemini: {
    apiKey: required('GEMINI_API_KEY'),
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  },
  telegram: {
    botToken: required('TELEGRAM_BOT_TOKEN'),
    chatId: required('TELEGRAM_CHAT_ID'),
  },
  marketDataUrl: process.env.MARKET_DATA_URL || 'https://afx.kwayisi.org/nse/',
  // Optional. If set, getMarketSnapshot() uses the Apify actor as the
  // primary data source and only falls back to scraping marketDataUrl if
  // this isn't configured or the Apify call fails.
  apify: process.env.APIFY_TOKEN
    ? {
        token: process.env.APIFY_TOKEN,
        actorId: process.env.APIFY_ACTOR_ID || 'mansalabs/african-stock-market-data',
      }
    : null,
  // Optional: when set, /api/cron/briefing requires this as a Bearer token.
  // Vercel automatically sends it on scheduled Cron invocations once this
  // env var exists — see vercel.json and README.md.
  cronSecret: process.env.CRON_SECRET || null,
};
