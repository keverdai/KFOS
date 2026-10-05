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
      // A handful of founders, not a mailing list — one pooled connection
      // reused across sends avoids a fresh TLS handshake per email.
      pool: true,
      maxConnections: 1,
      // nodemailer's defaults here are minutes long (2min connect, 10min
      // socket) — fine for a batch job, but deadly for a button someone is
      // staring at waiting for a page to respond. Fail fast instead; the
      // one retry above still gets a second shot at a slow handshake.
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

// Errors worth one retry: transient connection issues (a slow DNS/TCP
// handshake right as the Render instance wakes from sleep, a dropped
// socket). A bad password (EAUTH) or a rejected recipient won't fix itself
// on retry, so those fail immediately instead of doubling the wait.
const RETRYABLE_CODES = new Set(['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNRESET']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// { to, subject, html, text } -> { sent: boolean, skipped?: true, error? }
async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] SMTP not configured, skipping email to ${to}: ${subject}`);
    return { sent: false, skipped: true };
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await t.sendMail({ from: fromAddress(), to, subject, html, text });
      console.log(`[mailer] sent "${subject}" to ${to}`);
      return { sent: true };
    } catch (err) {
      const willRetry = attempt === 1 && RETRYABLE_CODES.has(err.code);
      console.error(
        `[mailer] failed to send "${subject}" to ${to} (attempt ${attempt})${willRetry ? ', retrying' : ''}:`,
        err
      );
      if (!willRetry) return { sent: false, error: err };
      await sleep(3000);
    }
  }
}

// Fire-and-forget: starts the send and returns immediately, so a route
// handler can redirect right away instead of making someone's browser sit
// on a POST while SMTP does its (sometimes slow) thing. The eventual
// result is only observable in server logs — fine for this app's low
// volume and internal-tool stakes; sendMail() itself stays available for
// callers (like a test-send) that do want to wait and report the outcome.
function queueMail(args) {
  sendMail(args).catch((err) => {
    console.error(`[mailer] unexpected error sending "${args.subject}" to ${args.to}:`, err);
  });
}

module.exports = { enabled, sendMail, queueMail };
