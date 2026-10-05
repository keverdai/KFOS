// Email sending, gated by environment variables — same pattern as
// lib/keverd.js: off by default, nothing breaks if it's not configured.
//
// Two transports:
// - Brevo's HTTP API (BREVO_API_KEY) — preferred when set. Render's free
//   plan blocks outbound traffic on every SMTP port (25, 465, 587) as of
//   Sept 2025: the connection just hangs until it times out, no matter how
//   the timeout is tuned, because the packets are silently dropped. An
//   HTTPS call on port 443 isn't affected, so this is what actually works
//   there. https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports
// - Generic SMTP (SMTP_HOST/PORT/USER/PASS) — works anywhere that isn't a
//   Render free instance (a paid Render plan, Fly.io, a VPS, etc.) with
//   any provider's relay. Kept so this app isn't locked to one host or
//   one provider.

const nodemailer = require('nodemailer');

let transporter = null;

function brevoEnabled() {
  return Boolean(process.env.BREVO_API_KEY);
}

function enabled() {
  return brevoEnabled() || Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function fromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || 'kfos@keverd.com';
}

function getTransporter() {
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
      // Sends go through queueMail() (see below) and never block a
      // request, so there's no reason to race the timeout tight — give it
      // real room; the retries below still bound the total wait.
      connectionTimeout: 20000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
  }
  return transporter;
}

async function sendViaBrevoApi({ to, subject, html, text }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: fromAddress(), name: process.env.SMTP_FROM_NAME || 'KFOS' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Brevo API responded ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
}

async function sendViaSmtp({ to, subject, html, text }) {
  await getTransporter().sendMail({ from: fromAddress(), to, subject, html, text });
}

// A bad API key/password, or a rejected address, won't fix itself on
// retry — everything else (a dropped connection, a momentary 5xx) is
// worth another try.
function isPermanentError(err) {
  if (err.code === 'EAUTH') return true;
  if (typeof err.status === 'number' && (err.status === 401 || err.status === 403 || err.status === 400)) {
    return true;
  }
  return false;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [3000, 8000]; // between attempts 1→2 and 2→3

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// { to, subject, html, text } -> { sent: boolean, skipped?: true, error? }
// Runs via queueMail() for anything triggered from a route, so taking a
// while here costs nobody a hung page — only the eventual log line.
async function sendMail({ to, subject, html, text }) {
  if (!enabled()) {
    console.log(`[mailer] not configured, skipping email to ${to}: ${subject}`);
    return { sent: false, skipped: true };
  }
  const send = brevoEnabled() ? sendViaBrevoApi : sendViaSmtp;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await send({ to, subject, html, text });
      console.log(`[mailer] sent "${subject}" to ${to}`);
      return { sent: true };
    } catch (err) {
      const willRetry = attempt < MAX_ATTEMPTS && !isPermanentError(err);
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
// on a POST while the send does its (sometimes slow) thing. The eventual
// result is only observable in server logs — fine for this app's low
// volume and internal-tool stakes; sendMail() itself stays available for
// callers that do want to wait and report the outcome.
function queueMail(args) {
  sendMail(args).catch((err) => {
    console.error(`[mailer] unexpected error sending "${args.subject}" to ${args.to}:`, err);
  });
}

module.exports = { enabled, sendMail, queueMail };
