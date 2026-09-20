const { Keverd } = require('@keverdjs/node');

let client = null;

function enabled() {
  return Boolean(process.env.KEVERD_SECRET_KEY && process.env.KEVERD_PUBLIC_KEY);
}

function publicKey() {
  return process.env.KEVERD_PUBLIC_KEY || '';
}

function getClient() {
  if (!process.env.KEVERD_SECRET_KEY) return null;
  if (!client) {
    client = new Keverd({ secretKey: process.env.KEVERD_SECRET_KEY });
  }
  return client;
}

function summarize(risk) {
  if (!risk) return null;
  return {
    event_id: risk.event_id,
    device_id: risk.visitor_id || risk.fingerprint,
    action: risk.action || risk.recommendation,
    risk_score: risk.risk_score,
    trust_score: risk.trust_score,
    country: risk.country_name || (risk.location && risk.location.country_name),
    ip: risk.location && risk.location.ip,
    times_seen: risk.times_seen,
    is_new: risk.is_new,
    reasons: (risk.reasons || []).map((r) => r.code || r),
    smart_signals: risk.smart_signals
      ? {
          vpn: risk.smart_signals.vpn_detected,
          tor: risk.smart_signals.tor_detected,
          incognito: risk.smart_signals.incognito_detected,
          datacenter: risk.smart_signals.datacenter_detected,
          bot: risk.smart_signals.bot_detected,
          browser: risk.smart_signals.browser,
          os: risk.smart_signals.operating_system,
        }
      : null,
  };
}

function logEvent(label, risk) {
  const summary = summarize(risk);
  console.log(`[keverd] ${label}`, summary ? JSON.stringify(summary, null, 2) : 'no result');
}

async function verifyLoginEvent(eventId) {
  const keverd = getClient();
  if (!keverd) return { skipped: true, risk: null };
  if (!eventId) return { skipped: true, risk: null, missingEventId: true };

  const risk = await keverd.verify(eventId);
  logEvent('login verify', risk);
  return { skipped: false, risk };
}

module.exports = {
  enabled,
  publicKey,
  verifyLoginEvent,
  summarize,
};
