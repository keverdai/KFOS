// Per-founder session auth. Each founder authenticates with their own
// email + password; everything downstream reads identity from req.founder,
// never from a client-supplied id — that's the whole point of moving off a
// single shared password plus a founder picker.

const crypto = require('crypto');
const repo = require('./repo');

const COOKIE_NAME = 'kfos_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function isHttps(req) {
  return req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

function setSessionCookie(req, res, token) {
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isHttps(req)) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(req, res) {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isHttps(req)) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

function createSession(founderId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  repo.authSessions.create(token, founderId, expiresAt);
  return token;
}

// Attaches req.founder / res.locals.currentFounder when the session cookie
// is present and valid. Never blocks the request — pair with requireAuth.
function loadFounder(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (token) {
    const row = repo.authSessions.getWithFounder(token);
    if (row && row.active && new Date(row.expires_at) > new Date()) {
      req.founder = {
        id: row.founder_id,
        name: row.name,
        role: row.role,
        email: row.email,
      };
      res.locals.currentFounder = req.founder;
    } else if (row) {
      // Expired or deactivated — clean up so it isn't checked again.
      repo.authSessions.delete(token);
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.founder) return next();
  const next_ = encodeURIComponent(req.originalUrl || '/');
  res.redirect(`/login?next=${next_}`);
}

// Very small brute-force speed bump. In-memory only (resets on restart) —
// this is a 3-person internal tool, not a bank, so we don't need more than
// "stop trivial automated guessing."
const failedAttempts = new Map(); // email -> { count, blockedUntil }

function isLoginBlocked(email) {
  const entry = failedAttempts.get(email.toLowerCase());
  if (!entry) return false;
  return entry.blockedUntil > Date.now();
}

function recordLoginFailure(email) {
  const key = email.toLowerCase();
  const entry = failedAttempts.get(key) || { count: 0, blockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= 5) {
    entry.blockedUntil = Date.now() + Math.min(30000 * (entry.count - 4), 5 * 60 * 1000);
  }
  failedAttempts.set(key, entry);
}

function clearLoginFailures(email) {
  failedAttempts.delete(email.toLowerCase());
}

// Periodic cleanup of expired session rows — no need to do this per-request.
setInterval(() => {
  try {
    repo.authSessions.deleteExpired();
  } catch {
    // best-effort
  }
}, 60 * 60 * 1000).unref();

module.exports = {
  COOKIE_NAME,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  createSession,
  loadFounder,
  requireAuth,
  isLoginBlocked,
  recordLoginFailure,
  clearLoginFailures,
};
