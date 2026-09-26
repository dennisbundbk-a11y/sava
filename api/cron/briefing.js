import { config } from '../../lib/config.js';
import { runBriefing } from '../../lib/runBriefing.js';

// Vercel Cron endpoint. Scheduled by vercel.json to run daily (see the
// "crons" entry). Vercel automatically sends `Authorization: Bearer
// <CRON_SECRET>` on scheduled invocations once CRON_SECRET is set as an
// env var — this checks it so the endpoint can't be triggered by anyone
// who finds the URL.
export default async function handler(req, res) {
  if (config.cronSecret) {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${config.cronSecret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  try {
    const result = await runBriefing();
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('Briefing failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
