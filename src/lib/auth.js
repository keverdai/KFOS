const crypto = require('crypto');
const settings = require('./settings');
const keverd = require('./keverd');

const COOKIE = 'kfos_session';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function authEnabled() {
  return Boolean(process.env.KFOS_AUTH_PASSWORD);
}

function expectedUsername() {
  return process.env.KFOS_AUTH_USERNAME || 'keverd';
}

function secret() {
  return process.env.KFOS_AUTH_SECRET || process.env.KFOS_AUTH_PASSWORD || 'kfos';
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function makeCookieValue(username) {
  const payload = b64url(JSON.stringify({ u: username, exp: Date.now() + MAX_AGE_MS }));
  return `${payload}.${sign(payload)}`;
}

function readCookie(header, name) {
  if (!header) return '';
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return '';
}

function sessionUser(req) {
  const raw = readCookie(req.headers.cookie, COOKIE);
  const dot = raw.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  if (!safeEqual(mac, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || data.exp < Date.now()) return null;
    if (!safeEqual(data.u, expectedUsername())) return null;
    return data.u;
  } catch {
    return null;
  }
}

function cookieFlags(req) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function setSession(res, req, username) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(makeCookieValue(username))}; ${cookieFlags(req)}`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function safeNext(value) {
  if (!value || typeof value !== 'string') return '/today';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/today';
  if (value.startsWith('/login') || value.startsWith('/logout')) return '/today';
  return value;
}

function renderLogin(req, res, extra = {}) {
  res.status(extra.status || 200).render('login', {
    layout: false,
    title: 'Sign in',
    companyName: settings.get('company_name', 'Keverd'),
    error: extra.error || null,
    next: extra.next || req.query.next || '/today',
    keverdEnabled: keverd.enabled(),
    keverdPublicKey: keverd.publicKey(),
  });
}

function requireAuth(req, res, next) {
  res.locals.authEnabled = authEnabled();
  res.locals.authUser = null;

  if (!authEnabled()) return next();

  if (req.path === '/login' && req.method === 'GET') {
    if (sessionUser(req)) return res.redirect(safeNext(req.query.next));
    return renderLogin(req, res);
  }

  if (req.path === '/login' && req.method === 'POST') {
    return handleLoginPost(req, res).catch((err) => {
      console.error('[keverd] login verify failed', err);
      return renderLogin(req, res, {
        status: 500,
        error: 'Couldn’t verify this device. Try again.',
        next: req.body.next,
      });
    });
  }

  if (req.path === '/logout' && (req.method === 'POST' || req.method === 'GET')) {
    clearSession(res);
    return res.redirect('/login');
  }

  const user = sessionUser(req);
  if (user) {
    res.locals.authUser = user;
    return next();
  }

  const nextPath = req.originalUrl || '/today';
  return res.redirect(`/login?next=${encodeURIComponent(nextPath)}`);
}

async function handleLoginPost(req, res) {
  const user = String(req.body.username || '');
  const pass = String(req.body.password || '');
  const eventId = String(req.body.eventId || '').trim();
  const visitorIdFromClient = String(req.body.visitorId || '').trim();

  if (keverd.enabled()) {
    const { risk, missingEventId } = await keverd.verifyLoginEvent(eventId);
    if (missingEventId) {
      console.warn('[keverd] login without eventId', { visitorIdFromClient });
    }
    if (risk && risk.action === 'block') {
      return renderLogin(req, res, {
        status: 403,
        error: 'This sign-in was blocked by device risk checks.',
        next: req.body.next,
      });
    }
    if (risk) {
      const deviceId = risk.visitor_id || risk.fingerprint || visitorIdFromClient;
      console.log(
        `[keverd] device=${deviceId || 'unknown'} action=${risk.action} score=${risk.risk_score} times_seen=${risk.times_seen}`
      );
    }
  }

  const okUser = safeEqual(user, expectedUsername());
  const okPass = safeEqual(pass, process.env.KFOS_AUTH_PASSWORD);
  if (!okUser || !okPass) {
    return renderLogin(req, res, {
      status: 401,
      error: 'That username or password isn’t right.',
      next: req.body.next,
    });
  }
  setSession(res, req, expectedUsername());
  return res.redirect(safeNext(req.body.next));
}

module.exports = requireAuth;
