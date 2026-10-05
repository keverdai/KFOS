// In-process daily scheduler for the email digest (lib/digest.js) — no new
// dependency. Polls every few minutes rather than computing a precise
// setTimeout delay, so it naturally recovers from the process restarting or
// sleeping (Render's free tier sleeps the instance) without ever sending
// the digest twice in the same day.

const settings = require('./settings');
const digest = require('./digest');

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let intervalHandle = null;

function todayLocalDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function tick() {
  const hour = Number(settings.get('digest_hour', '8'));
  if (new Date().getHours() < hour) return;

  const today = todayLocalDateStr();
  if (settings.get('digest_last_sent_date') === today) return;

  try {
    const results = await digest.sendDailyDigest();
    // Only recorded on success — a thrown error (vs. a per-founder send
    // failure, which sendDailyDigest already reports in its results array
    // without throwing) leaves today unmarked so the next tick retries.
    settings.set('digest_last_sent_date', today);
    console.log('[scheduler] daily digest sent', results);
  } catch (err) {
    console.error('[scheduler] daily digest run failed, will retry', err);
  }
}

function start() {
  if (intervalHandle) return;
  tick();
  intervalHandle = setInterval(tick, CHECK_INTERVAL_MS);
  if (intervalHandle.unref) intervalHandle.unref();
}

function stop() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = { start, stop };
