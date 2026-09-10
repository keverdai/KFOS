const db = require('./db');

function get(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function set(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

function getWeekdayPillarMap() {
  const raw = get('weekday_pillar_map');
  const { DEFAULT_WEEKDAY_PILLARS } = require('./pillars');
  if (!raw) return DEFAULT_WEEKDAY_PILLARS;
  try {
    return { ...DEFAULT_WEEKDAY_PILLARS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_WEEKDAY_PILLARS;
  }
}

function setWeekdayPillarMap(map) {
  set('weekday_pillar_map', JSON.stringify(map));
}

module.exports = { get, set, getWeekdayPillarMap, setWeekdayPillarMap };
