const express = require('express');
const router = express.Router();

const repo = require('../lib/repo');
const mailer = require('../lib/mailer');
const digest = require('../lib/digest');

function esc(s) {
  return String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function recipientsFromBody(body, founders) {
  const raw = body.recipients;
  if (!raw) return [];
  const ids = (Array.isArray(raw) ? raw : [raw]).map(Number);
  return founders.filter((f) => f.email && ids.includes(f.id));
}

router.get('/', (req, res) => {
  const founders = repo.founders.all(true);
  res.render('email', {
    title: 'Email',
    active: 'email',
    founders,
    mailerEnabled: mailer.enabled(),
  });
});

router.post('/custom', (req, res) => {
  const founders = repo.founders.all(true);
  const recipients = recipientsFromBody(req.body, founders);
  const subject = (req.body.subject || '').trim();
  const message = (req.body.message || '').trim();

  if (!mailer.enabled()) {
    return res.redirect('/email?flash=Email isn\'t configured yet — see README');
  }
  if (recipients.length === 0) {
    return res.redirect('/email?flash=Pick at least one recipient');
  }
  if (!subject || !message) {
    return res.redirect('/email?flash=Subject and message are both required');
  }

  const html = `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; color:#111; max-width:560px; white-space:pre-wrap;">
      <p>${esc(message)}</p>
      <p style="margin-top:16px; color:#555;">&mdash; ${esc(req.founder.name)}, via KFOS</p>
    </div>
  `;
  const text = `${message}\n\n— ${req.founder.name}, via KFOS`;

  recipients.forEach((f) => {
    mailer.queueMail({ to: f.email, subject, html, text });
  });

  res.redirect(`/email?flash=Sending to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`);
});

router.post('/digest', (req, res) => {
  const founders = repo.founders.all(true);
  const recipients = recipientsFromBody(req.body, founders);

  if (!mailer.enabled()) {
    return res.redirect('/email?flash=Email isn\'t configured yet — see README');
  }
  if (recipients.length === 0) {
    return res.redirect('/email?flash=Pick at least one recipient');
  }

  const results = digest.queueAttentionDigest({
    founderIds: recipients.map((f) => f.id),
    force: req.body.force === '1',
  });
  const queued = results.filter((r) => r.queued).length;
  const skipped = results.length - queued;
  const parts = [];
  if (queued) parts.push(`sending to ${queued}`);
  if (skipped) parts.push(`${skipped} skipped (nothing overdue/due soon)`);
  res.redirect(`/email?flash=${encodeURIComponent(parts.join(', ') || 'Nothing to send')}`);
});

module.exports = router;
