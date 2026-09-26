import { runBriefing } from '../lib/runBriefing.js';

runBriefing()
  .then((result) => {
    console.log('Briefing sent:', result);
  })
  .catch((err) => {
    console.error('Briefing failed:', err);
    process.exit(1);
  });
