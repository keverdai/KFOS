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

- **Today** (`/`) — today's pillar, session owner, overdue/upcoming
  commitments, and each founder's logged hours so far today.
- **Session** (`/sessions/:date`) — record the day's objective, discussion,
  and decisions, and turn decisions into commitments (owner, due date,
  Definition of Done).
- **Commitments** (`/commitments`) — the single board of truth. Filter by
  status/owner/pillar, update status with evidence attached.
- **Daily Log** (`/daily-log`) — the Daily Founder Log: hours + evidence per
  pillar, biggest outcome, biggest problem, tomorrow's decision. Takes under
  10 minutes.
- **Weekly Log** (`/weekly`) — auto-compiled Mon–Fri operating log with the
  weekly 🟢🟡🔴 pillar score.
- **Scorecard** (`/scorecard`) — per-founder weekly view: hours vs. target,
  commitments delivered, evidence entries. Hours are one input, not the
  metric — someone can log 30 hours and deliver nothing.
- **Settings** (`/settings`) — rename founders (seeded as CEO/CTO/COO),
  company name, daily hour target, rotation start date, weekday→pillar map.

## Running it locally (try it out first)

```bash
npm install
npm start
```

Then open http://localhost:3000 in your browser. Data is stored locally in
`data/kfos.db` (SQLite, created automatically on first run — nothing to
configure). No password is required in this mode — see **Password
protection** below for when you're ready to put it on a shared URL.

First thing to do: go to **Settings** and rename the three seeded founders
(CEO/CTO/COO) to your actual names.

To have all 3 of you try it on the same laptop before deploying anywhere,
just take turns — switch founder in the top-right selector on Daily Log,
or each open it in your own browser profile. The data is shared by
whoever is running `npm start`; the other two aren't seeing live updates
until it's actually hosted somewhere reachable (next section).

### Environment variables

- `PORT` — port to listen on (default `3000`)
- `KFOS_DB_PATH` — path to the SQLite file (default `data/kfos.db`)
- `KFOS_AUTH_PASSWORD` — sets a shared password and turns on login (see below)
- `KFOS_AUTH_USERNAME` — username to pair with it (default `keverd`)

## Password protection

The app has **no login by default** — fine for `localhost`, not fine once
it's reachable by URL, since anyone with the link could read or edit every
commitment and daily log. Setting `KFOS_AUTH_PASSWORD` turns on a single
shared HTTP Basic Auth login for the whole app (all 3 of you use the same
username/password):

```bash
KFOS_AUTH_USERNAME=keverd KFOS_AUTH_PASSWORD='choose-a-real-password' npm start
```

Every route — including static assets — requires that login once it's set.
Set both as environment variables on whatever host runs it (see below);
don't commit a real password into the repo.

## Deploying for daily use

This is a small stateful Node/Express app with a local SQLite file — the
simplest path is a single always-on box or a platform with a persistent
disk (a small VPS, Fly.io, Railway, Render with a persistent volume, etc.).
Point `KFOS_DB_PATH` at a persisted volume if the platform's filesystem is
ephemeral, and set `KFOS_AUTH_PASSWORD`/`KFOS_AUTH_USERNAME` there too. No
external services, accounts, or API keys are required beyond the host
itself.

## Project layout

```
index.js              entrypoint
src/app.js             Express app + view locals/helpers
src/lib/pillars.js      the 5 pillars + default weekday mapping
src/lib/rotation.js     date -> pillar / date -> session owner
src/lib/db.js           SQLite schema + seed
src/lib/settings.js     key/value settings helper
src/lib/repo.js         data access (founders, sessions, commitments, daily_logs)
src/routes/*            one file per section
src/views/*             EJS templates
public/css/style.css    styling
```
