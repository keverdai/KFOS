const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');

const settings = require('./lib/settings');
const { getPillar } = require('./lib/pillars');
const basicAuth = require('./lib/auth');

const guideRoutes = require('./routes/guide');
const todayRoutes = require('./routes/today');
const sessionRoutes = require('./routes/sessions');
const commitmentRoutes = require('./routes/commitments');
const dailyLogRoutes = require('./routes/dailyLog');
const weeklyRoutes = require('./routes/weekly');
const scorecardRoutes = require('./routes/scorecard');
const settingsRoutes = require('./routes/settings');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(basicAuth);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css')));

// Global template helpers / locals
app.use((req, res, next) => {
  res.locals.companyName = settings.get('company_name', 'Keverd');
  res.locals.flash = req.query.flash || null;
  // Status is conveyed by glyph + border style, never by hue — the UI is
  // strictly black/white/gray in both themes.
  res.locals.STATUS_LABELS = {
    open: { icon: '○', label: 'Open', cls: 'open' },
    green: { icon: '●', label: 'Done', cls: 'green' },
    yellow: { icon: '◐', label: 'Progressing', cls: 'yellow' },
    red: { icon: '✕', label: 'Missed', cls: 'red' },
    cancelled: { icon: '–', label: 'Cancelled', cls: 'cancelled' },
  };
  res.locals.pillarTagHtml = (pillarKey) => {
    const p = getPillar(pillarKey);
    if (!p) return '';
    return `<span class="pillar-tag"><span class="ico">${p.emoji}</span> ${p.label}</span>`;
  };
  res.locals.statusBadgeHtml = (status) => {
    const s = res.locals.STATUS_LABELS[status] || res.locals.STATUS_LABELS.open;
    return `<span class="status-badge status-${s.cls}"><span class="status-dot">${s.icon}</span> ${s.label}</span>`;
  };
  res.locals.formatDateNice = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };
  next();
});

app.use('/', guideRoutes);
app.use('/today', todayRoutes);
app.use('/sessions', sessionRoutes);
app.use('/commitments', commitmentRoutes);
app.use('/daily-log', dailyLogRoutes);
app.use('/weekly', weeklyRoutes);
app.use('/scorecard', scorecardRoutes);
app.use('/settings', settingsRoutes);

app.use((req, res) => {
  res.status(404).render('404', { title: 'Not found', active: '' });
});

module.exports = app;
