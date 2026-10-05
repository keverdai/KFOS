// Generic SMTP email sending, gated by environment variables — same pattern
// as lib/keverd.js: off by default, nothing breaks if it's not configured,
// no vendor lock-in. Any provider that offers an SMTP relay works
// (SendGrid, Mailgun, Postmark, AWS SES, Gmail, Office 365, a company mail
// server) — point SMTP_HOST/PORT/USER/PASS at whichever one you use.

const nodemailer = require('nodemailer');

let transporter = null;

function enabled() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function fromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || 'kfos@keverd.com';
}

function getTransporter() {
  if (!enabled()) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // Port 465 is implicit TLS; everything else (587, 25) starts plain
      // and upgrades via STARTTLS — nodemailer only picks that correctly
      // if `secure` reflects which one this port actually is.
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

// { to, subject, html, text } -> { sent: boolean, skipped?: true, error? }
async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] SMTP not configured, skipping email to ${to}: ${subject}`);
    return { sent: false, skipped: true };
  }
  try {
    await t.sendMail({ from: fromAddress(), to, subject, html, text });
    console.log(`[mailer] sent "${subject}" to ${to}`);
    return { sent: true };
  } catch (err) {
    console.error(`[mailer] failed to send "${subject}" to ${to}:`, err);
    return { sent: false, error: err };
  }
}

module.exports = { enabled, sendMail };
