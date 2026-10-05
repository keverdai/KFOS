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
    console.log('[scheduler] daily digest run', results);
    // sendDailyDigest() never throws for a per-founder send failure (mailer
    // already catches those and reports them in the results array), so a
    // thrown error here is something else entirely. Either way, only mark
    // today done once every recipient actually got their email or was
    // deliberately skipped (nothing to report) — any real send failure
    // leaves today unmarked so the next tick (a few minutes later) retries,
    // rather than silently giving up on the whole day.
    const anyFailed = results.some((r) => r.error);
    if (!anyFailed) settings.set('digest_last_sent_date', today);
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
