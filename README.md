# Savannah Market

AI-powered investing site for the Nairobi Securities Exchange, plus a
scheduled Gemini + Telegram briefing.

## What's in this repo

```
index.html            Marketing landing page
dashboard.html         Market dashboard (summary, movers, economic overview)
stock.html              Individual stock page (Safaricom / SCOM worked example)

api/cron/briefing.js    Vercel serverless function — runs the daily briefing
lib/                     Shared backend code (market data, Gemini, Telegram, math)
data/                    portfolio.json (your holdings) and watchlist.json
scripts/run-once.js      Run the briefing locally without deploying, for testing

vercel.json              Cron schedule for the briefing endpoint
package.json             Backend dependencies (the HTML pages need no build step)
```

The three `.html` pages are plain static files — no framework, no build
step. The briefing pipeline is a small serverless function so your Gemini
key and Telegram bot token never touch the browser.

## 1. Push to GitHub

```bash
git init
git add .
git commit -m "Savannah Market: site + AI briefing"
git branch -M main
git remote add origin https://github.com/<your-username>/savannah-market.git
git push -u origin main
```

(`.gitignore` already excludes `node_modules`, `.env`, and `.vercel`.)

## 2. Deploy on Vercel

1. Go to https://vercel.com/new and import the GitHub repo.
2. Framework preset: choose **"Other"** — there's no framework to detect,
   and Vercel will serve the root `.html` files as static pages and
   `api/cron/briefing.js` as a serverless function automatically.
3. Before the first deploy (or right after, then redeploy), add these
   under **Project Settings → Environment Variables**:
   - `GEMINI_API_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `CRON_SECRET` — any random string you make up (e.g. from
     `openssl rand -hex 32`). Once this exists, Vercel automatically sends
     it as `Authorization: Bearer <value>` on scheduled Cron calls, and
     `api/cron/briefing.js` checks it — this stops anyone else from
     triggering your briefing by guessing the URL.
   - `MARKET_DATA_URL` — optional, only if you're not using the default.
4. Deploy. Your site is now live at `<project>.vercel.app`, with
   `dashboard.html` and `stock.html` reachable from the landing page's nav.

## 3. Getting the Gemini key and Telegram bot set up

**Gemini API key**: https://aistudio.google.com/app/apikey — create a key.

**Telegram bot + chat id**:
1. Message **@BotFather** on Telegram, run `/newbot`, follow the prompts,
   copy the token it gives you.
2. Send any message to your new bot (search its username, hit Start).
3. Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` — find
   `"chat":{"id": ...}` in the response and copy that number.

## 4. Your holdings and watchlist

Edit `data/portfolio.json` with your real holdings (ticker, shares, average
purchase price, purchase date) and `data/watchlist.json` with tickers you
want scanned for opportunities. Commit and push — Vercel redeploys
automatically on every push to `main`.

## 5. The cron schedule

`vercel.json` runs the briefing daily at **04:00 UTC (07:00 Nairobi time)**:

```json
{ "crons": [{ "path": "/api/cron/briefing", "schedule": "0 4 * * *" }] }
```

Change the schedule string to adjust the time. Note the NSE is closed on
weekends, so you may want `0 4 * * 1-5` (weekdays only) instead.

Cron jobs on Vercel's free (Hobby) plan run **once per day maximum** — that
matches what's built here. If you upgrade to Pro later and want more
frequent checks, you can add more entries to the `crons` array.

## 6. Test it before waiting for the schedule

Locally:

```bash
npm install
cp .env.example .env      # fill in the values
npm run once
```

This runs the exact same code path as the Vercel cron and sends one
Telegram message immediately, so you can confirm it works.

On Vercel, you can also trigger it manually by visiting
`https://<project>.vercel.app/api/cron/briefing` in a browser with an
`Authorization: Bearer <CRON_SECRET>` header (e.g. via `curl`):

```bash
curl -H "Authorization: Bearer <your CRON_SECRET>" \
  https://<project>.vercel.app/api/cron/briefing
```

## 7. Market data — read before relying on it

`lib/fetchMarketData.js` scrapes a public NSE summary page as a fallback so
this works out of the box, and degrades gracefully (rather than crashing)
if the page structure changes and prices come back empty. For anything
beyond personal, low-frequency use, replace it with a licensed/paid NSE
data provider — the platform's own spec calls for respecting NSE data
licensing, and scraped pages can change or restrict access without notice.
The function signature is the only thing the rest of the code depends on,
so swapping the data source doesn't require touching `gemini.js`,
`telegram.js`, or the API route.

## 8. What the briefing actually says

Gemini is given only your holdings, current prices, and today's movers, and
is explicitly told not to invent prices or news. Every report ends with:
"Informational only — not financial advice. Verify prices before acting."
— matching the disclaimer requirement from the platform's legal section.
