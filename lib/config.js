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
  // Optional: when set, /api/cron/briefing requires this as a Bearer token.
  // Vercel automatically sends it on scheduled Cron invocations once this
  // env var exists — see vercel.json and README.md.
  cronSecret: process.env.CRON_SECRET || null,
};
