# Savannah Market

AI-powered investing site for the Nairobi Securities Exchange, plus a
scheduled Gemini + Telegram briefing.

## What's in this repo

```
public/
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
2. Framework preset: choose **"Other"** — `vercel.json` sets
   `"outputDirectory": "public"` so Vercel knows to serve the pages in
   `public/` as the site, and treats `api/cron/briefing.js` as a serverless
   function automatically. (If you ever see a deployed link download a file
   instead of opening the page, this setting is almost always why — check
   Project Settings → General → Output Directory is set to `public`.)
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

## 7. Market data — Apify (primary) + scraper (fallback)

**Apify setup:**
1. Create an account at https://apify.com and go to Console → Settings →
   Integrations → **Personal API tokens**. Copy a token.
2. Set `APIFY_TOKEN` (and optionally `APIFY_ACTOR_ID`, default is
   `mansalabs/african-stock-market-data`) in `.env` locally, and as Vercel
   env vars for production.
3. Apify actors are pay-per-result/pay-per-run — check the actor's pricing
   tab before running it on a daily schedule.

**Verify it actually works before trusting it:** Apify's own docs pages
don't show a fully worked example of the JSON each actor returns, so
`lib/fetchMarketData.js` makes a best-effort guess at field names
(`normalizeQuote()`). The first time you run `npm run once`:
- If it works, great — quotes will show up in the Telegram message.
- If quotes come back empty, the console will log a sample raw item from
  Apify. Compare its actual keys against `normalizeQuote()` in
  `lib/fetchMarketData.js` and adjust the field names to match.
- You can also open the run directly in Apify Console (Actors → Runs) to
  inspect the dataset visually.

If `mansalabs/african-stock-market-data`'s NSE coverage doesn't work out,
`wafspaul/nse-kenya-market-data` is a narrower alternative built
specifically for the NSE (returns gainers/losers/most-active directly) —
swap `APIFY_ACTOR_ID` and adjust the input object in
`APIFY_ACTOR_INPUT` inside `lib/fetchMarketData.js` accordingly.

**Fallback scraper:** if `APIFY_TOKEN` is blank, or the Apify call fails,
`getMarketSnapshot()` falls back to scraping `MARKET_DATA_URL` directly
(a public NSE summary page). This is more fragile — plain HTML parsing
breaks silently if the page layout changes — but means the pipeline still
runs with no Apify account at all.

For anything beyond personal, low-frequency use, remember the platform's
own spec calls for respecting NSE data licensing — a scraped page (via
Apify or directly) isn't a licensed feed. See the official routes discussed
in-chat (NSE's own Data Services API, or their list of licensed vendors) if
this becomes a real product rather than a personal tool.

## 8. Live data on the website itself

Two public, read-only API routes power the frontend (separate from the
Telegram cron job, which still runs on its own schedule):

- **`/api/market-snapshot`** — calls the same `getMarketSnapshot()` used by
  the briefing (Apify, or the scraper fallback). `dashboard.html`'s Market
  Movers table and `stock.html`'s price header fetch this on page load.
- **`/api/ai-score?ticker=SCOM`** — calls Gemini fresh for the given ticker
  and returns a score, recommendation, confidence, and factor breakdown as
  JSON. `stock.html`'s AI Investment Score panel fetches this on page load.

Both routes hold their credentials server-side — the browser never sees
`GEMINI_API_KEY` or the Apify token. Both need the matching env vars set in
Vercel to return real data (`APIFY_TOKEN` for live movers, `GEMINI_API_KEY`
for the AI score); without them, the pages fall back to showing the
original example data and label it as such (a small status line next to
each section's heading says "Live" or "Example data — … unavailable" so
it's always clear which mode is active).

The landing page (`index.html`) still shows fixed example numbers by
design — it's a marketing preview, not the live app.

## 9. What the Telegram briefing actually says

Gemini is given only your holdings, current prices, and today's movers, and
is explicitly told not to invent prices or news. Every report ends with:
"Informational only — not financial advice. Verify prices before acting."
— matching the disclaimer requirement from the platform's legal section.
