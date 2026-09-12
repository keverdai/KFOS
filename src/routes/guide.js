const express = require('express');
const router = express.Router();

const { PILLARS, PRIORITY_PSEUDO_PILLAR } = require('../lib/pillars');
const settings = require('../lib/settings');

function renderGuide(req, res) {
  res.render('guide', {
    title: 'Guide',
    active: 'guide',
    PILLARS,
    PRIORITY_PSEUDO_PILLAR,
    dailyHourTarget: settings.get('daily_hour_target', '6'),
  });
}

// Mounted at '/' so opening the app lands here; also reachable at /guide
// directly (e.g. from the nav) so both URLs work.
router.get('/', renderGuide);
router.get('/guide', renderGuide);

module.exports = router;
