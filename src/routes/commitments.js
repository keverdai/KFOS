const express = require('express');
const router = express.Router();

const repo = require('../lib/repo');
const rotation = require('../lib/rotation');
const { allPillarsIncludingPriority } = require('../lib/pillars');

router.get('/', (req, res) => {
  const { status, owner, pillar } = req.query;
  const filters = {};
  if (status) filters.status = status;
  if (owner) filters.owner_founder_id = Number(owner);
  if (pillar) filters.pillar = pillar;

  const commitments = repo.commitments.all(filters);
  const founders = repo.founders.all(true);

  res.render('commitments', {
    title: 'Commitments',
    active: 'commitments',
    commitments,
    founders,
    allPillars: allPillarsIncludingPriority(),
    filters: { status: status || '', owner: owner || '', pillar: pillar || '' },
    todayStr: rotation.todayStr(),
  });
});

router.post('/new', (req, res) => {
  repo.commitments.create({
    session_id: null,
    pillar: req.body.pillar,
    description: req.body.description,
    definition_of_done: req.body.definition_of_done,
    owner_founder_id: req.body.owner_founder_id || null,
    due_date: req.body.due_date || null,
  });
  res.redirect('/commitments?flash=Commitment added');
});

router.post('/:id/status', (req, res) => {
  const { status, evidence, status_note } = req.body;
  repo.commitments.updateStatus(req.params.id, status, evidence, status_note);
  res.redirect('/commitments?flash=Status updated#c' + req.params.id);
});

module.exports = router;
