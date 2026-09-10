const express = require('express');
const router = express.Router();

const repo = require('../lib/repo');
const rotation = require('../lib/rotation');
const { getPillar, allPillarsIncludingPriority } = require('../lib/pillars');

function loadSessionPage(date, res, title) {
  const founders = repo.founders.all(true);
  const pillarKey = rotation.getPillarKeyForDate(date);
  const owner = rotation.getOwnerForDate(date, founders);
  const session = repo.sessions.getByDate(date);
  const commitments = session ? repo.commitments.bySession(session.id) : [];
  const pillar = pillarKey ? getPillar(pillarKey) : null;

  res.render('session', {
    title: title || `Session · ${date}`,
    active: 'today',
    date,
    pillar,
    owner,
    session,
    founders,
    commitments,
    isWeekend: rotation.isWeekend(date),
    allPillars: allPillarsIncludingPriority(),
  });
}

router.get('/:date', (req, res) => {
  loadSessionPage(req.params.date, res);
});

router.post('/:date', (req, res) => {
  const { date } = req.params;
  const pillarKey = rotation.getPillarKeyForDate(date) || 'priority';
  const founders = repo.founders.all(true);
  const owner = rotation.getOwnerForDate(date, founders);

  repo.sessions.upsert({
    date,
    pillar: req.body.pillar || pillarKey,
    owner_founder_id: req.body.owner_founder_id || (owner ? owner.id : null),
    objective: req.body.objective || '',
    discussion: req.body.discussion || '',
    decisions: req.body.decisions || '',
  });

  res.redirect(`/sessions/${date}?flash=Session saved`);
});

router.post('/:date/close', (req, res) => {
  const session = repo.sessions.getByDate(req.params.date);
  if (session) repo.sessions.close(session.id);
  res.redirect(`/sessions/${req.params.date}?flash=Session closed`);
});

router.post('/:date/commitments', (req, res) => {
  const { date } = req.params;
  let session = repo.sessions.getByDate(date);
  if (!session) {
    const pillarKey = rotation.getPillarKeyForDate(date) || 'priority';
    const founders = repo.founders.all(true);
    const owner = rotation.getOwnerForDate(date, founders);
    session = repo.sessions.upsert({
      date,
      pillar: pillarKey,
      owner_founder_id: owner ? owner.id : null,
      objective: '',
      discussion: '',
      decisions: '',
    });
  }

  repo.commitments.create({
    session_id: session.id,
    pillar: req.body.pillar || session.pillar,
    description: req.body.description,
    definition_of_done: req.body.definition_of_done,
    owner_founder_id: req.body.owner_founder_id || null,
    due_date: req.body.due_date || null,
  });

  res.redirect(`/sessions/${date}?flash=Commitment added`);
});

module.exports = router;
