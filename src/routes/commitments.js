const express = require('express');
const router = express.Router();

const repo = require('../lib/repo');
const rotation = require('../lib/rotation');
const mailer = require('../lib/mailer');
const { queueCommitmentNotification } = require('../lib/notify');
const { allPillarsIncludingPriority } = require('../lib/pillars');

const PAGE_SIZE = 8;

const ATTENTION_LABELS = {
  overdue: 'Overdue',
  due_soon: 'Due within 3 days',
};

function buildPageUrl({ status, owner, pillar, attention, page }) {
  const q = new URLSearchParams();
  if (attention) q.set('attention', attention);
  else if (status) q.set('status', status);
  if (owner) q.set('owner', owner);
  if (pillar) q.set('pillar', pillar);
  if (page > 1) q.set('page', String(page));
  const qs = q.toString();
  return '/commitments' + (qs ? '?' + qs : '');
}

function buildCommitmentFilters(query) {
  const { status, owner, pillar, attention } = query;
  const todayStr = rotation.todayStr();
  const filters = {};
  if (owner) filters.owner_founder_id = Number(owner);
  if (pillar) filters.pillar = pillar;

  if (attention === 'overdue') {
    filters.attention = 'overdue';
    filters.asOfDate = todayStr;
  } else if (attention === 'due_soon') {
    filters.attention = 'due_soon';
    filters.dueBefore = rotation.addDays(todayStr, 3);
  } else if (status) {
    filters.status = status;
  }

  return {
    filters,
    filterQuery: {
      status: attention ? '' : (status || ''),
      owner: owner || '',
      pillar: pillar || '',
      attention: attention || '',
    },
    attentionLabel: ATTENTION_LABELS[attention] || null,
  };
}

function redirectBack(req, res, { flash, hash = '' }) {
  const referer = req.get('Referer') || '';
  let target = '/commitments';
  if (referer.includes('/commitments')) {
    try {
      const url = new URL(referer, 'http://localhost');
      target = url.pathname + url.search;
    } catch {
      target = referer.split('#')[0];
    }
  }
  const sep = target.includes('?') ? '&' : '?';
  res.redirect(`${target}${sep}flash=${encodeURIComponent(flash)}${hash}`);
}

router.get('/', (req, res) => {
  const { filters, filterQuery, attentionLabel } = buildCommitmentFilters(req.query);

  const total = repo.commitments.count(filters);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  const commitments = repo.commitments.all({ ...filters, limit: PAGE_SIZE, offset });
  const founders = repo.founders.all(true);
  // Include inactive founders too so old commitments still show a real name
  // for "created by" / "updated by" instead of "unknown".
  const allFoundersEverActive = repo.founders.all();

  res.render('commitments', {
    title: 'Commitments',
    active: 'commitments',
    commitments,
    founders,
    allFoundersEverActive,
    allPillars: allPillarsIncludingPriority(),
    filters: filterQuery,
    attentionLabel,
    todayStr: rotation.todayStr(),
    pagination: {
      page,
      totalPages,
      total,
      pageSize: PAGE_SIZE,
      from: total === 0 ? 0 : offset + 1,
      to: Math.min(offset + PAGE_SIZE, total),
    },
    pageHref: (p) => buildPageUrl({ ...filterQuery, page: p }),
    clearAttentionHref: buildPageUrl({ status: filterQuery.status, owner: filterQuery.owner, pillar: filterQuery.pillar, page: 1 }),
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
    created_by_founder_id: req.founder.id,
  });
  res.redirect('/commitments?flash=Commitment added');
});

router.post('/:id/status', (req, res) => {
  const { status, evidence, status_note } = req.body;
  repo.commitments.updateStatus(req.params.id, status, evidence, status_note, req.founder.id);
  redirectBack(req, res, { flash: 'Status updated', hash: '#c' + req.params.id });
});

// Manual only — this is the one path that puts a commitment's details in
// someone's inbox, and it only fires when a founder clicks this button.
router.post('/:id/notify', (req, res) => {
  const commitment = repo.commitments.getById(req.params.id);
  if (!commitment) {
    return redirectBack(req, res, { flash: 'Commitment not found' });
  }
  if (!mailer.enabled()) {
    return redirectBack(req, res, { flash: "Email isn't configured yet — see README" });
  }
  const owner = commitment.owner_founder_id ? repo.founders.get(commitment.owner_founder_id) : null;
  if (!owner || !owner.email) {
    return redirectBack(req, res, { flash: 'This commitment has no owner with an email set' });
  }
  queueCommitmentNotification(commitment, owner, req.founder);
  redirectBack(req, res, { flash: `Sending to ${owner.name}`, hash: '#c' + req.params.id });
});

module.exports = router;
