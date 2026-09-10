const express = require('express');
const router = express.Router();

const repo = require('../lib/repo');
const rotation = require('../lib/rotation');
const settings = require('../lib/settings');

router.get('/', (req, res) => {
  const anchor = req.query.date || rotation.todayStr();
  const dates = rotation.weekDates(anchor);
  const founders = repo.founders.all(true);
  const hourTarget = Number(settings.get('daily_hour_target', '6'));

  const dailyLogs = repo.dailyLogs.inRange(dates[0], dates[4]);
  const commitments = repo.commitments.inRange(dates[0], dates[4]);

  const rows = founders.map((f) => {
    const logs = dailyLogs.filter((l) => l.founder_id === f.id);
    const totalHours = logs.reduce(
      (sum, l) =>
        sum +
        l.revenue_hours +
        l.product_hours +
        l.distribution_hours +
        l.infrastructure_hours +
        l.learning_hours,
      0
    );
    const ownedCommitments = commitments.filter((c) => c.owner_founder_id === f.id && c.status !== 'cancelled');
    const delivered = ownedCommitments.filter((c) => c.status === 'green').length;
    const missed = ownedCommitments.filter((c) => c.status === 'red').length;
    const evidenceEntries = logs.filter(
      (l) =>
        l.revenue_evidence ||
        l.product_evidence ||
        l.distribution_evidence ||
        l.infrastructure_evidence ||
        l.learning_evidence
    ).length;

    return {
      founder: f,
      daysLogged: logs.length,
      totalHours,
      targetHours: hourTarget * 5,
      commitmentTotal: ownedCommitments.length,
      delivered,
      missed,
      deliveryRate: ownedCommitments.length ? Math.round((delivered / ownedCommitments.length) * 100) : null,
      evidenceEntries,
    };
  });

  res.render('scorecard', {
    title: 'Founder Scorecard',
    active: 'scorecard',
    weekLabel: rotation.formatWeekLabel(anchor),
    rows,
    prevWeek: rotation.addDays(dates[0], -7),
    nextWeek: rotation.addDays(dates[0], 7),
    thisWeek: rotation.todayStr(),
  });
});

module.exports = router;
