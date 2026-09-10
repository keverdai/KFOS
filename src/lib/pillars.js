// The five KFOS pillars, in fixed priority order (Level 1 = highest priority).
// This order is the company's cultural decision rule: when two pieces of work
// compete for time, the one serving the higher-numbered-priority (lower index)
// pillar wins.
const PILLARS = [
  {
    key: 'revenue',
    label: 'Revenue',
    level: 1,
    emoji: '💰',
    question: 'Does this help us acquire, retain, or get paid by a customer?',
    color: '#1a7f37',
  },
  {
    key: 'product',
    label: 'Product',
    level: 2,
    emoji: '🧠',
    question: 'Does this make Keverd materially better?',
    color: '#0969da',
  },
  {
    key: 'distribution',
    label: 'Distribution',
    level: 3,
    emoji: '📣',
    question: 'Does this increase our ability to reach customers?',
    color: '#8250df',
  },
  {
    key: 'infrastructure',
    label: 'Infrastructure',
    level: 4,
    emoji: '⚙️',
    question: 'Does this make the company faster, safer, or more scalable?',
    color: '#bf6a02',
  },
  {
    key: 'learning',
    label: 'Learning',
    level: 5,
    emoji: '🔬',
    question: 'Does this give us information that changes a decision?',
    color: '#0891b2',
  },
];

// Default weekday -> pillar mapping for the *session* (Mon-Fri). This is
// configurable in Settings, but ships with the cadence from the KFOS design:
// Mon Revenue, Tue Product, Wed Distribution, Thu Founder Priority
// (a free pillar chosen by that week's owner), Fri Learning + Review.
const DEFAULT_WEEKDAY_PILLARS = {
  1: 'revenue', // Monday
  2: 'product', // Tuesday
  3: 'distribution', // Wednesday
  4: 'priority', // Thursday - Founder Priority Session (owner picks the pillar)
  5: 'learning', // Friday - Learning + Review
};

const PRIORITY_PSEUDO_PILLAR = {
  key: 'priority',
  label: 'Founder Priority',
  level: 0,
  emoji: '🎯',
  question: 'What is the single most important problem Keverd needs to solve right now?',
  color: '#cf222e',
};

function getPillar(key) {
  if (key === 'priority') return PRIORITY_PSEUDO_PILLAR;
  return PILLARS.find((p) => p.key === key);
}

function allPillarsIncludingPriority() {
  // Priority slotted at position 0 for display purposes on Thursdays.
  return [PRIORITY_PSEUDO_PILLAR, ...PILLARS];
}

module.exports = {
  PILLARS,
  DEFAULT_WEEKDAY_PILLARS,
  PRIORITY_PSEUDO_PILLAR,
  getPillar,
  allPillarsIncludingPriority,
};
