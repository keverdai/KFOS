// Rotation logic: which pillar is in session on a given date, and which
// founder owns that session.
//
// Design (see README): the weekday -> pillar mapping is fixed (configurable
// in Settings), but the *owner* of a pillar's session rotates fairly across
// the team on a cycle equal to the team size, so that over N weeks every
// founder has run every weekday's session exactly once.

const settings = require('./settings');

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function mondayOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function todayStr() {
  return toDateStr(new Date());
}

// 0 = Monday ... 4 = Friday, null for weekends
function weekdayIndex(dateStr) {
  const d = parseDate(dateStr);
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return null;
  return day - 1;
}

function getWeekIndex(dateStr) {
  const startStr = settings.get('rotation_start_date');
  const start = mondayOf(parseDate(startStr));
  const monday = mondayOf(parseDate(dateStr));
  const days = Math.round((monday.getTime() - start.getTime()) / 86400000);
  return Math.floor(days / 7);
}

function getPillarKeyForDate(dateStr) {
  const wd = weekdayIndex(dateStr);
  if (wd === null) return null;
  const map = settings.getWeekdayPillarMap();
  return map[wd + 1] || null; // map is keyed 1(Mon)..5(Fri) for readability in settings UI
}

// founders: array of founder rows ordered by sort_order, already active-only
function getOwnerForDate(dateStr, founders) {
  if (!founders || founders.length === 0) return null;
  const wd = weekdayIndex(dateStr);
  if (wd === null) return null;
  const weekIndex = getWeekIndex(dateStr);
  const n = founders.length;
  const ownerIndex = (((wd + weekIndex) % n) + n) % n; // guard against negative weekIndex
  return founders[ownerIndex];
}

function isWeekend(dateStr) {
  return weekdayIndex(dateStr) === null;
}

function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}

function weekDates(dateStr) {
  const monday = mondayOf(parseDate(dateStr));
  const out = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(toDateStr(d));
  }
  return out;
}

function formatWeekLabel(dateStr) {
  const dates = weekDates(dateStr);
  const start = parseDate(dates[0]);
  const end = parseDate(dates[4]);
  const opts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })} – ${end.toLocaleDateString(
    'en-US',
    { ...opts, timeZone: 'UTC' }
  )}, ${end.getUTCFullYear()}`;
}

module.exports = {
  parseDate,
  toDateStr,
  mondayOf,
  todayStr,
  weekdayIndex,
  getWeekIndex,
  getPillarKeyForDate,
  getOwnerForDate,
  isWeekend,
  addDays,
  weekDates,
  formatWeekLabel,
};
