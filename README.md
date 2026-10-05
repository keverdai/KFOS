# KFOS — Keverd Founder Operating System

KFOS is Keverd's internal logger for its 6-hour founder operating culture. It
is not a task manager. It exists to make one thing visible every day: **did
this move the company forward, and where's the evidence?**

## The philosophy this app implements

Keverd is pre-revenue, three founders, and the CEO has asked for tangible
evidence of six hours a day of founder-level work. KFOS operationalizes that
without turning into a task-ticket bureaucracy:

- **Priority hierarchy, not six departments.** Every day is assigned one of
  five pillars — Revenue, Product, Distribution, Infrastructure, Learning —
  in that priority order. When work competes for time, the higher pillar wins.
- **Sessions produce resolutions, not vibes.** Each weekday has a session
  owner (rotates fairly across the team) who runs a short discussion and
  must leave it with: Decision → Owner → Deadline → Evidence definition.
- **Commitments, not tasks.** A commitment has an owner, a due date, and a
  written Definition of Done — so "was it delivered?" is never a debate.
- **Evidence, not hours in a chair.** Founders log hours *and* what they
  produced against each pillar. "Thought about the product for 3 hours" is
  not evidence; "tested 3 approaches, rejected 2, shipped the third" is.
- **Weekly score, not a task count.** Every Friday, each pillar rolls up to
  🟢 done / 🟡 progressing / 🔴 missed / ⚪ cancelled based on that week's
  commitments — visible on the Weekly Operating Log.
- **No commitment without an owner. No completion without evidence. No
  failure without learning.**

## Pillars & default weekly cadence

| Day | Pillar | Question |
|---|---|---|
| Mon | 💰 Revenue | Does this help us acquire/retain/get paid by a customer? |
| Tue | 🧠 Product | Does this make Keverd materially better? |
| Wed | 📣 Distribution | Does this increase our ability to reach customers? |
| Thu | 🎯 Founder Priority | What's the single most important problem right now? |
| Fri | 🔬 Learning + Review | What did we learn, and what changes? |

(⚙️ Infrastructure is a fifth pillar available any day, including Thursdays,
whenever it's genuinely the priority — see Settings.)

The weekday → pillar mapping is editable in **Settings**.

### Fair rotation of session ownership

The pillar assigned to a weekday is fixed, but *who runs it* rotates. Across
the team's cycle length (3 founders → 3 weeks), every founder ends up owning
every weekday's session exactly once — so nobody permanently becomes "the
sales person" or "the coding person." This is computed automatically from a
configurable rotation start date; see `src/lib/rotation.js`.

## What's in the app

- **Guide** (`/`) — lands here on open: what KFOS is, why it exists, the
  rules, and what counts as evidence, all in one place.
- **Today** (`/today`) — today's pillar, session owner, overdue/upcoming
  commitments, and each founder's logged hours so far today.
- **Session** (`/sessions/:date`) — record the day's objective, discussion,
  and decisions, and turn decisions into commitments (owner, due date,
  Definition of Done).
- **Commitments** (`/commitments`) — the single board of truth. Filter by
  status/owner/pillar, update status with evidence attached. Every
  commitment records who logged it and who last updated its status.
- **Daily Log** (`/daily-log`) — the Daily Founder Log: hours + evidence per
  pillar, biggest outcome, biggest problem, tomorrow's decision. Takes under
  10 minutes. You can only ever log or edit *your own* entry — see
  **Founder accounts** below.
- **Weekly Log** (`/weekly`) — auto-compiled Mon–Fri operating log with the
  weekly 🟢🟡🔴 pillar score.
- **Scorecard** (`/scorecard`) — per-founder weekly view: hours vs. target,
  commitments delivered, evidence entries. Hours are one input, not the
  metric — someone can log 30 hours and deliver nothing.
- **Settings** (`/settings`) — your own account (email + password), rename
  founders (seeded as CEO/CTO/COO), reset a teammate's password, company
  name, daily hour target, rotation start date, weekday→pillar map.
- **Email** (`/email`) — send a custom message or an overdue/due-soon
  summary, on demand — see **Email** below.

## Running it locally (try it out first)

```bash
npm install
npm start
```

Then open http://localhost:3000 in your browser — it'll redirect straight
to **Sign in**. Data is stored locally in `data/kfos.db` (SQLite, created
automatically on first run, seeded with three placeholder founders and
placeholder emails — nothing else to configure).

### Environment variables

- `PORT` — port to listen on (default `3000`)
- `KFOS_DB_PATH` — path to the SQLite file (default `data/kfos.db`)
- `TURSO_DATABASE_URL` — hosted SQLite URL (use this on Render’s free plan; see below)
- `TURSO_AUTH_TOKEN` — Turso auth token paired with that URL
- `KEVERD_PUBLIC_KEY` — browser collect key (`kv_pk_test_…` / `kv_pk_live_…`) for device checks on login
- `KEVERD_SECRET_KEY` — server verify key (`kv_sk_…`); never expose this in the browser
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `SMTP_SECURE` — outbound email (see **Email** below)
- `APP_BASE_URL` — e.g. `https://kfos.keverd.com`; used to build the link back into the app inside emails (links are relative if unset)

## Founder accounts (how login works)

Every founder signs in with their **own** email and password — there is no
shared password and no "pick your name from a dropdown." This is what ties
every logged hour and every commitment write to the actual person who did
it, not to whoever happened to be selected in a menu:

1. **First sign-in claims the account.** The three founders are seeded with
   placeholder emails — `ceo@keverd.com`, `cto@keverd.com`, `coo@keverd.com`.
   Go to `/login`, enter the email your team gave you; since it has no
   password yet, you'll be asked to choose one right there. That password
   is yours from then on.
2. **After that, it's a normal sign-in** — email, then password.
3. Once signed in, go to **Settings → Your account** to change your email
   to your real one and set/change your password any time (change requires
   your current password).
4. **Locked out?** Any other signed-in founder can reset your password from
   **Settings → Founders** — that clears it, so your *next* sign-in works
   like a first-time claim again.

Sessions are signed cookies (30-day expiry) backed by a server-side table in
the same database. Passwords are hashed with `scrypt` (Node's built-in
`crypto`, no extra dependency). A handful of failed logins on one email
triggers a short cooldown.

### Optional: Keverd device check on login

With both `KEVERD_PUBLIC_KEY` and `KEVERD_SECRET_KEY` set, the login page
additionally collects a device fingerprint via the
[Keverd JS SDK](https://developer.keverd.com/quickstart) and the server
verifies the `event_id` with [`@keverdjs/node`](https://developer.keverd.com/node-js)
on every claim/sign-in attempt — layered on top of the per-founder login
above, never a replacement for it. Event details (device id, risk score,
action, location/smart signals) are logged server-side on every attempt, so
this doubles as a way to watch real login traffic. An explicit `block`
verdict from Keverd rejects the sign-in; a Keverd API error never does —
login fails open rather than risking an outage there locking out the whole
team. Get keys at [dashboard.keverd.com](https://dashboard.keverd.com).

## Email

Nothing emails anyone automatically — every send here happens because
someone clicked a button. There's no scheduler, no daily cron, no "digest
hour" to configure. Three ways to send, all from **Email** (`/email`) or the
commitments board:

- **Custom message** (`/email`) — pick recipients, write a subject and a
  message, send it. For anything that isn't one of the two below.
- **Overdue & due-soon summary** (`/email`) — for each selected founder,
  sends *their own* overdue and soon-due (within 3 days) commitments, plus
  today's session (pillar, who's running it, what to discuss). A founder
  with nothing to report is skipped unless you check "send anyway."
- **Notify a commitment's owner** — an "Email [name]" button on each row of
  the **Commitments** board sends that one commitment's details (what it
  is, Definition of Done, due date) straight to its owner. Use it right
  after adding a new commitment, or any time it needs a nudge.

Off by default — nothing breaks if you skip this. To turn it on, set:

- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` — any provider's SMTP relay (SendGrid,
  Mailgun, Postmark, SES, Brevo, Gmail, Office 365, a company mail server)
- `SMTP_PORT` — default `587` (STARTTLS); use `465` for implicit TLS
- `SMTP_FROM` — optional; defaults to `SMTP_USER`
- `SMTP_SECURE` — optional override (`true`/`false`); inferred from the port otherwise

Sending is fire-and-forget: clicking a send button returns immediately
rather than making you wait on SMTP, which can be slow or occasionally
flaky depending on the provider and network — the actual send happens in
the background (one automatic retry on a transient connection error) and
its outcome shows up in the server logs, not the page.

## Deploying for daily use

This is a small stateful Node/Express app. Locally it writes to `data/kfos.db`.
On a host with a persistent disk (a VPS, Fly.io, Railway, Render **paid** with
a volume), point `KFOS_DB_PATH` at that volume.

### Render free plan (why data disappears)

Render’s free web service has **no persistent disk**. The instance sleeps after
inactivity and is rebuilt on deploys — anything written to `data/kfos.db` is
deleted. A paid Render disk would fix this; on the free plan, store SQLite
**off the box** with Turso (hosted libSQL, free tier):

1. Create a database at [turso.tech](https://turso.tech) (`turso db create kfos`).
2. Copy the URL and token:
   `turso db show kfos --url`
   `turso db tokens create kfos`
3. In the Render dashboard → Environment, add:
   - `TURSO_DATABASE_URL` = `libsql://….turso.io`
   - `TURSO_AUTH_TOKEN` = the token
4. Redeploy. Logs should say `KFOS database: Turso (hosted SQLite)`.

Local `npm start` without those variables still uses the file on disk. Do not
commit tokens. If you already have local data you want to keep, dump it and
load it into Turso (`turso db shell kfos`) rather than expecting Render’s
disk to survive.

## Project layout

```
index.js                entrypoint
src/app.js               Express app + view locals/helpers
src/lib/pillars.js        the 5 pillars + default weekday mapping
src/lib/rotation.js       date -> pillar / date -> session owner
src/lib/db.js             SQLite schema, migrations + seed
src/lib/settings.js       key/value settings helper
src/lib/passwords.js      scrypt password hashing
src/lib/auth.js           session cookies, loadFounder/requireAuth, login throttling
src/lib/keverd.js         optional device-risk check, layered onto login (see above)
src/lib/mailer.js         optional SMTP sending, fire-and-forget (see Email)
src/lib/digest.js         builds each founder's overdue/due-soon summary email
src/lib/notify.js         builds a single commitment's "notify owner" email
src/lib/repo.js           data access (founders, auth_sessions, sessions, commitments, daily_logs)
src/routes/auth.js        /login, /logout
src/routes/guide.js       landing page ('/')
src/routes/email.js       /email — custom message + overdue/due-soon summary, manual send only
src/routes/*              one file per other section
src/views/*               EJS templates
public/css/style.css      styling
```
