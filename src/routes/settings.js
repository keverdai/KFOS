const express = require('express');
const router = express.Router();

const repo = require('../lib/repo');
const settings = require('../lib/settings');
const mailer = require('../lib/mailer');
const digest = require('../lib/digest');
const { allPillarsIncludingPriority } = require('../lib/pillars');
const { hashPassword, verifyPassword } = require('../lib/passwords');

const MIN_PASSWORD_LENGTH = 8;

router.get('/', (req, res) => {
  const founders = repo.founders.all();
  res.render('settings', {
    title: 'Settings',
    active: 'settings',
    founders,
    rotationStartDate: settings.get('rotation_start_date'),
    dailyHourTarget: settings.get('daily_hour_target'),
    companyName: settings.get('company_name'),
    weekdayPillarMap: settings.getWeekdayPillarMap(),
    allPillars: allPillarsIncludingPriority(),
    minPasswordLength: MIN_PASSWORD_LENGTH,
    digestHour: settings.get('digest_hour', '8'),
    digestLastSentDate: settings.get('digest_last_sent_date'),
    mailerEnabled: mailer.enabled(),
  });
});

router.post('/founders/:id', (req, res) => {
  repo.founders.rename(req.params.id, req.body.name, req.body.role);
  res.redirect('/settings?flash=Founder updated');
});

router.post('/founders/:id/active', (req, res) => {
  repo.founders.setActive(req.params.id, req.body.active === '1');
  res.redirect('/settings?flash=Founder updated');
});

// Password resets for a teammate (e.g. they're locked out) — clears their
// password so their next successful login sets a fresh one, same as first
// claiming the account. Never lets you reset your own this way; use the
// Account section below for that (it requires your current password).
router.post('/founders/:id/reset-password', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.founder.id) {
    return res.redirect('/settings?flash=Use the Account section below to change your own password');
  }
  repo.founders.clearPassword(id);
  res.redirect('/settings?flash=Password reset — they\'ll set a new one next time they sign in');
});

// ---- Account (self-service only — identity-sensitive, so no editing
// someone else's email or password from here) ----

router.post('/account/email', (req, res) => {
  const email = (req.body.email || '').trim();
  if (!email) {
    return res.redirect('/settings?flash=Email can\'t be empty');
  }
  const existing = repo.founders.getByEmail(email);
  if (existing && existing.id !== req.founder.id) {
    return res.redirect('/settings?flash=That email is already in use by another founder');
  }
  repo.founders.setEmail(req.founder.id, email);
  res.redirect('/settings?flash=Email updated — use it next time you sign in');
});

router.post('/account/password', (req, res) => {
  const founder = repo.founders.get(req.founder.id);
  const { current_password, new_password, confirm_new_password } = req.body;

  if (!verifyPassword(current_password || '', founder.password_hash)) {
    return res.redirect('/settings?flash=Current password is incorrect');
  }
  if ((new_password || '').length < MIN_PASSWORD_LENGTH) {
    return res.redirect(`/settings?flash=New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (new_password !== confirm_new_password) {
    return res.redirect('/settings?flash=New passwords don\'t match');
  }
  repo.founders.setPasswordHash(req.founder.id, hashPassword(new_password));
  res.redirect('/settings?flash=Password updated');
});

router.post('/general', (req, res) => {
  settings.set('company_name', req.body.company_name || 'Keverd');
  settings.set('daily_hour_target', req.body.daily_hour_target || '6');
  if (req.body.rotation_start_date) {
    // Normalize to the Monday of the chosen week so the rotation math stays consistent.
    const rotation = require('../lib/rotation');
    const monday = rotation.mondayOf(rotation.parseDate(req.body.rotation_start_date));
    settings.set('rotation_start_date', rotation.toDateStr(monday));
  }
  res.redirect('/settings?flash=Settings saved');
});

router.post('/weekday-pillars', (req, res) => {
  const map = {};
  for (let i = 1; i <= 5; i++) {
    map[i] = req.body['day' + i];
  }
  settings.setWeekdayPillarMap(map);
  res.redirect('/settings?flash=Weekday pillars saved');
});

router.post('/digest-hour', (req, res) => {
  const hour = Number(req.body.digest_hour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return res.redirect('/settings?flash=Digest hour must be a whole number from 0 to 23');
  }
  settings.set('digest_hour', String(hour));
  res.redirect('/settings?flash=Digest send time saved');
});

router.post('/digest-test-send', async (req, res) => {
  if (!mailer.enabled()) {
    return res.redirect('/settings?flash=Set SMTP_HOST/SMTP_USER/SMTP_PASS first — see README');
  }
  const [result] = await digest.sendDailyDigest({ onlyFounderId: req.founder.id, force: true });
  if (!result) {
    return res.redirect('/settings?flash=Add an email to your account first — see Your account above');
  }
  if (result.sent) {
    return res.redirect(`/settings?flash=Test digest sent to ${encodeURIComponent(result.email)}`);
  }
  return res.redirect('/settings?flash=Test send failed — check server logs');
});

module.exports = router;
