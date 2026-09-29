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
   like a first-time claim again (choose a fresh password there).

Sessions are plain signed cookies (30-day expiry), stored server-side in the
same SQLite file — no external session store needed. Passwords are hashed
with `scrypt` (Node's built-in `crypto`, no extra dependency). A handful of
failed logins on one email triggers a short cooldown.

**What this doesn't include yet:** GitHub/Google OAuth and magic email
links both need something this environment doesn't have — an OAuth app
registered with a client id/secret, or an email-sending service/API key —
so they're not wired up. The session/founder model here (`req.founder`,
never a client-supplied id) is built so either could be added later as
just another way to establish `req.founder`, without touching anything
downstream.

## Deploying for daily use

This is a small stateful Node/Express app with a local SQLite file — the
simplest path is a single always-on box or a platform with a persistent
disk (a small VPS, Fly.io, Railway, Render with a persistent volume, etc.).
Point `KFOS_DB_PATH` at a persisted volume if the platform's filesystem is
ephemeral. Login cookies are marked `Secure` automatically once the app
sees an HTTPS request (`trust proxy` is on, so this also works correctly
behind a reverse proxy that terminates TLS) — no extra config needed. No
external services, accounts, or API keys are required beyond the host
itself.

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
src/lib/repo.js           data access (founders, auth_sessions, sessions, commitments, daily_logs)
src/routes/auth.js        /login, /logout
src/routes/guide.js       landing page ('/')
src/routes/*              one file per other section
src/views/*               EJS templates
public/css/style.css      styling
```
