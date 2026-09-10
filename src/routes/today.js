const express = require('express');
const router = express.Router();

const repo = require('../lib/repo');
const rotation = require('../lib/rotation');
const { getPillar } = require('../lib/pillars');

router.get('/', (req, res) => {
  const date = req.query.date || rotation.todayStr();
  const founders = repo.founders.all(true);
  const pillarKey = rotation.getPillarKeyForDate(date);
  const owner = rotation.getOwnerForDate(date, founders);
  const session = repo.sessions.getByDate(date);
  const pillar = pillarKey ? getPillar(pillarKey) : null;

  const openCommitments = repo.commitments.all({}).filter((c) => c.status === 'open' || c.status === 'yellow');
  const dueSoon = openCommitments.filter((c) => c.due_date && c.due_date <= rotation.addDays(rotation.todayStr(), 3));
  const overdue = openCommitments.filter((c) => c.due_date && c.due_date < rotation.todayStr());

  const todaysLogs = repo.dailyLogs.byDate(rotation.todayStr());
  const hourTarget = Number(require('../lib/settings').get('daily_hour_target', '6'));

  res.render('today', {
    title: 'Today',
    active: 'today',
    date,
    isWeekend: rotation.isWeekend(date),
    pillar,
    owner,
    session,
    founders,
    dueSoon,
    overdue,
    todaysLogs,
    hourTarget,
    prevDate: rotation.addDays(date, -1),
    nextDate: rotation.addDays(date, 1),
    todayStr: rotation.todayStr(),
  });
});

module.exports = router;
