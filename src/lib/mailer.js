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
      // Sends go through queueMail() now (see below) and never block a
      // request, so there's no reason to race the timeout tight the way an
      // earlier version of this file did — that just turned "a bit slow"
      // into "times out every time" on a Render-to-Brevo path that's
      // apparently taking longer than 8s to connect. Give it real room;
      // the retries below still bound the total wait.
      connectionTimeout: 20000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
  }
  return transporter;
}

// Errors worth retrying: transient connection issues (a slow DNS/TCP
// handshake, a dropped socket, a relay that's momentarily unreachable). A
// bad password (EAUTH) or a rejected recipient won't fix itself on retry,
// so those fail immediately instead of wasting the wait.
const RETRYABLE_CODES = new Set(['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNRESET']);
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [3000, 8000]; // between attempts 1→2 and 2→3

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// { to, subject, html, text } -> { sent: boolean, skipped?: true, error? }
// Runs via queueMail() for anything triggered from a route, so taking a
// while here costs nobody a hung page — only the eventual log line.
async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] SMTP not configured, skipping email to ${to}: ${subject}`);
    return { sent: false, skipped: true };
  }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await t.sendMail({ from: fromAddress(), to, subject, html, text });
      console.log(`[mailer] sent "${subject}" to ${to}`);
      return { sent: true };
    } catch (err) {
      const willRetry = attempt < MAX_ATTEMPTS && RETRYABLE_CODES.has(err.code);
      console.error(
        `[mailer] failed to send "${subject}" to ${to} (attempt ${attempt}/${MAX_ATTEMPTS})${willRetry ? ', retrying' : ''}:`,
        err
      );
      if (!willRetry) return { sent: false, error: err };
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
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
