const express = require('express');
const router = express.Router();

const repo = require('../lib/repo');
const rotation = require('../lib/rotation');
const settings = require('../lib/settings');
const { PILLARS } = require('../lib/pillars');

router.get('/', (req, res) => {
  const date = req.query.date || rotation.todayStr();
  const founders = repo.founders.all(true);
  const selectedFounderId = Number(req.query.founder) || (founders[0] && founders[0].id);
  const existing = repo.dailyLogs.getByDateFounder(date, selectedFounderId);
  const history = repo.dailyLogs.inRange(rotation.addDays(date, -13), date);
  const hourTarget = Number(settings.get('daily_hour_target', '6'));

  res.render('daily-log', {
    title: 'Daily Founder Log',
    active: 'daily-log',
    date,
    founders,
    selectedFounderId,
    existing,
    history,
    hourTarget,
    PILLARS,
  });
});

router.post('/', (req, res) => {
  const b = req.body;
  const entry = {
    date: b.date,
    founder_id: Number(b.founder_id),
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
  res.redirect(`/daily-log?date=${entry.date}&founder=${entry.founder_id}&flash=Log saved`);
});

module.exports = router;
