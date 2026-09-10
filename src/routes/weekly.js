const express = require('express');
const router = express.Router();

const repo = require('../lib/repo');
const rotation = require('../lib/rotation');
const { getPillar, PILLARS } = require('../lib/pillars');

function scoreFor(commitments) {
  if (commitments.length === 0) return null;
  const counts = { green: 0, yellow: 0, red: 0, cancelled: 0, open: 0 };
  commitments.forEach((c) => counts[c.status]++);
  const active = commitments.length - counts.cancelled;
  if (active === 0) return 'cancelled';
  if (counts.red > 0 && counts.red >= counts.green) return 'red';
  if (counts.yellow > 0 || counts.open > 0) return 'yellow';
  return 'green';
}

router.get('/', (req, res) => {
  const anchor = req.query.date || rotation.todayStr();
  const dates = rotation.weekDates(anchor);
  const founders = repo.founders.all(true);

  const days = dates.map((date) => {
    const pillarKey = rotation.getPillarKeyForDate(date);
    const pillar = pillarKey ? getPillar(pillarKey) : null;
    const owner = rotation.getOwnerForDate(date, founders);
    const session = repo.sessions.getByDate(date);
    const commitments = (session ? repo.commitments.bySession(session.id) : []).map((c) => ({
      ...c,
      ownerFounder: founders.find((f) => f.id === c.owner_founder_id) || null,
    }));
    return { date, pillar, owner, session, commitments };
  });

  const weekCommitments = repo.commitments.inRange(dates[0], dates[4]);
  const pillarScores = PILLARS.map((p) => ({
    pillar: p,
    score: scoreFor(weekCommitments.filter((c) => c.pillar === p.key)),
  }));

  const dailyLogs = repo.dailyLogs.inRange(dates[0], dates[4]);
  const hoursByFounder = founders.map((f) => {
    const logs = dailyLogs.filter((l) => l.founder_id === f.id);
    const total = logs.reduce(
      (sum, l) =>
        sum +
        l.revenue_hours +
        l.product_hours +
        l.distribution_hours +
        l.infrastructure_hours +
        l.learning_hours,
      0
    );
    return { founder: f, total, days: logs.length };
  });

  res.render('weekly', {
    title: 'Weekly Operating Log',
    active: 'weekly',
    weekLabel: rotation.formatWeekLabel(anchor),
    days,
    pillarScores,
    hoursByFounder,
    prevWeek: rotation.addDays(dates[0], -7),
    nextWeek: rotation.addDays(dates[0], 7),
    thisWeek: rotation.todayStr(),
  });
});

module.exports = router;
