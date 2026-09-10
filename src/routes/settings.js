const express = require('express');
const router = express.Router();

const repo = require('../lib/repo');
const settings = require('../lib/settings');
const { allPillarsIncludingPriority } = require('../lib/pillars');

router.get('/', (req, res) => {
  const founders = repo.founders.all();
  res.render('settings', {
    title: 'Settings',
    active: 'settings',
    founders,
    rotationStartDate: settings.get('rotation_start_date'),
    dailyHourTarget: settings.get('daily_hour_target'),
    companyName: settings.get('company_name'),
    weekdayPillarMap: settings.getWeekdayPillarMap(),
    allPillars: allPillarsIncludingPriority(),
  });
});

router.post('/founders/:id', (req, res) => {
  repo.founders.rename(req.params.id, req.body.name, req.body.role);
  res.redirect('/settings?flash=Founder updated');
});

router.post('/founders/:id/active', (req, res) => {
  repo.founders.setActive(req.params.id, req.body.active === '1');
  res.redirect('/settings?flash=Founder updated');
});

router.post('/general', (req, res) => {
  settings.set('company_name', req.body.company_name || 'Keverd');
  settings.set('daily_hour_target', req.body.daily_hour_target || '6');
  if (req.body.rotation_start_date) {
    // Normalize to the Monday of the chosen week so the rotation math stays consistent.
    const rotation = require('../lib/rotation');
    const monday = rotation.mondayOf(rotation.parseDate(req.body.rotation_start_date));
    settings.set('rotation_start_date', rotation.toDateStr(monday));
  }
  res.redirect('/settings?flash=Settings saved');
});

router.post('/weekday-pillars', (req, res) => {
  const map = {};
  for (let i = 1; i <= 5; i++) {
    map[i] = req.body['day' + i];
  }
  settings.setWeekdayPillarMap(map);
  res.redirect('/settings?flash=Weekday pillars saved');
});

module.exports = router;
