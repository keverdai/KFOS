const express = require('express');
const router = express.Router();

const repo = require('../lib/repo');
const auth = require('../lib/auth');
const { hashPassword, verifyPassword } = require('../lib/passwords');

const MIN_PASSWORD_LENGTH = 8;

function renderLogin(req, res, overrides = {}) {
  const email = overrides.email !== undefined ? overrides.email : req.query.email || '';
  const next = overrides.next !== undefined ? overrides.next : req.query.next || '';
  const error = overrides.error !== undefined ? overrides.error : req.query.error || '';
  let mode = 'email';
  let founder = null;

  if (email) {
    founder = repo.founders.getByEmail(email);
    if (founder && !founder.password_hash) mode = 'claim';
    else if (founder) mode = 'signin';
    else mode = 'notfound';
  }

  res.render('login', {
    title: 'Sign in',
    active: 'login',
    email,
    next,
    error,
    mode,
    founder,
    minPasswordLength: MIN_PASSWORD_LENGTH,
  });
}

router.get('/login', (req, res) => {
  if (req.founder) return res.redirect('/today');
  renderLogin(req, res);
});

router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';
  const confirm = req.body.confirm || '';
  const mode = req.body.mode;
  const next = req.body.next || '';

  if (!email) {
    return renderLogin(req, res, { email: '', error: 'Enter your email.' });
  }

  const founder = repo.founders.getByEmail(email);

  if (mode === 'claim') {
    // Re-check server-side: don't trust the client's idea of whether this
    // account is already claimed (avoids a race where two tabs both show
    // the "set a password" form).
    if (!founder) {
      return renderLogin(req, res, { email, error: 'No account found for that email.' });
    }
    if (founder.password_hash) {
      return renderLogin(req, res, {
        email,
        error: 'This account already has a password — sign in instead.',
      });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return renderLogin(req, res, {
        email,
        next,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }
    if (password !== confirm) {
      return renderLogin(req, res, { email, next, error: "Passwords don't match." });
    }
    repo.founders.setPasswordHash(founder.id, hashPassword(password));
    const token = auth.createSession(founder.id);
    auth.setSessionCookie(req, res, token);
    return res.redirect(next || '/today');
  }

  // Sign-in mode.
  if (auth.isLoginBlocked(email)) {
    return renderLogin(req, res, {
      email,
      next,
      error: 'Too many attempts — wait a minute and try again.',
    });
  }

  if (!founder || !founder.active || !verifyPassword(password, founder.password_hash)) {
    auth.recordLoginFailure(email);
    return renderLogin(req, res, { email, next, error: 'Incorrect email or password.' });
  }

  auth.clearLoginFailures(email);
  const token = auth.createSession(founder.id);
  auth.setSessionCookie(req, res, token);
  res.redirect(next || '/today');
});

router.post('/logout', (req, res) => {
  const cookies = auth.parseCookies(req.headers.cookie);
  const token = cookies[auth.COOKIE_NAME];
  if (token) repo.authSessions.delete(token);
  auth.clearSessionCookie(req, res);
  res.redirect('/login');
});

module.exports = router;
