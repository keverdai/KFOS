const express = require('express');
const router = express.Router();

const repo = require('../lib/repo');
const rotation = require('../lib/rotation');
const settings = require('../lib/settings');
const { PILLARS } = require('../lib/pillars');

router.get('/', (req, res) => {
  const date = req.query.date || rotation.todayStr();
  // You can only ever edit your own log — identity comes from the signed-in
  // session, not a dropdown. (Everyone's entries are still visible below,
  // in the read-only history table.)
  const existing = repo.dailyLogs.getByDateFounder(date, req.founder.id);
  const history = repo.dailyLogs.inRange(rotation.addDays(date, -13), date);
  const hourTarget = Number(settings.get('daily_hour_target', '6'));

  res.render('daily-log', {
    title: 'Daily Founder Log',
    active: 'daily-log',
    date,
    existing,
    history,
    hourTarget,
    PILLARS,
  });
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.post('/', (req, res) => {
  const b = req.body || {}; // a body-less request (e.g. a bot) still needs to hit the validation below, not crash

  // The SQLite driver in front of this (libsql/Turso in production) binds a
  // missing/undefined/NaN parameter as SQL NULL instead of throwing — so an
  // incomplete submission (a bot hitting this endpoint directly, a stale
  // request, a bad client) used to reach the DB and crash with an unhandled
  // "NOT NULL constraint failed" 500 instead of a clean validation error.
  // Reject it here instead.
  const date = typeof b.date === 'string' ? b.date.trim() : '';
  const founderId = Number(b.founder_id);

  if (!DATE_RE.test(date)) {
    return res.redirect('/daily-log?flash=' + encodeURIComponent('Could not save: missing or invalid date'));
  }
  if (!Number.isInteger(founderId) || !repo.founders.get(founderId)) {
    return res.redirect(
      `/daily-log?date=${date}&flash=` + encodeURIComponent('Could not save: missing or unknown founder')
    );
  }

  const entry = {
    date,
    founder_id: founderId,
    revenue_hours: Number(b.revenue_hours) || 0,
    revenue_evidence: b.revenue_evidence || '',
    product_hours: Number(b.product_hours) || 0,
    product_evidence: b.product_evidence || '',
    distribution_hours: Number(b.distribution_hours) || 0,
    distribution_evidence: b.distribution_evidence || '',
    infrastructure_hours: Number(b.infrastructure_hours) || 0,
    infrastructure_evidence: b.infrastructure_evidence || '',
    learning_hours: Number(b.learning_hours) || 0,
    learning_evidence: b.learning_evidence || '',
    biggest_outcome: b.biggest_outcome || '',
    biggest_problem: b.biggest_problem || '',
    decision_tomorrow: b.decision_tomorrow || '',
  };
  repo.dailyLogs.upsert(entry);
  res.redirect(`/daily-log?date=${entry.date}&flash=Log saved`);
});

module.exports = router;
