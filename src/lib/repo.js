const db = require('./db');

// ---- Founders ----
const founders = {
  all(activeOnly = false) {
    const sql = activeOnly
      ? 'SELECT * FROM founders WHERE active = 1 ORDER BY sort_order'
      : 'SELECT * FROM founders ORDER BY sort_order';
    return db.prepare(sql).all();
  },
  get(id) {
    return db.prepare('SELECT * FROM founders WHERE id = ?').get(id);
  },
  rename(id, name, role) {
    db.prepare('UPDATE founders SET name = ?, role = ? WHERE id = ?').run(name, role, id);
  },
  setActive(id, active) {
    db.prepare('UPDATE founders SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  },
};

// ---- Sessions ----
const sessions = {
  getByDate(date) {
    return db.prepare('SELECT * FROM sessions WHERE date = ?').get(date);
  },
  getById(id) {
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  },
  upsert({ date, pillar, owner_founder_id, objective, discussion, decisions }) {
    const existing = sessions.getByDate(date);
    if (existing) {
      db.prepare(
        `UPDATE sessions SET pillar = ?, owner_founder_id = ?, objective = ?, discussion = ?, decisions = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(pillar, owner_founder_id, objective, discussion, decisions, existing.id);
      return sessions.getById(existing.id);
    }
    const info = db
      .prepare(
        `INSERT INTO sessions (date, pillar, owner_founder_id, objective, discussion, decisions)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(date, pillar, owner_founder_id, objective, discussion, decisions);
    return sessions.getById(info.lastInsertRowid);
  },
  close(id) {
    db.prepare("UPDATE sessions SET closed = 1, updated_at = datetime('now') WHERE id = ?").run(id);
  },
  inRange(startDate, endDate) {
    return db
      .prepare('SELECT * FROM sessions WHERE date >= ? AND date <= ? ORDER BY date')
      .all(startDate, endDate);
  },
};

// ---- Commitments ----
const commitments = {
  create({ session_id, pillar, description, definition_of_done, owner_founder_id, due_date }) {
    const info = db
      .prepare(
        `INSERT INTO commitments (session_id, pillar, description, definition_of_done, owner_founder_id, due_date)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(session_id || null, pillar, description, definition_of_done || '', owner_founder_id || null, due_date || null);
    return commitments.getById(info.lastInsertRowid);
  },
  getById(id) {
    return db.prepare('SELECT * FROM commitments WHERE id = ?').get(id);
  },
  updateStatus(id, status, evidence, status_note) {
    db.prepare(
      `UPDATE commitments SET status = ?, evidence = ?, status_note = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(status, evidence || '', status_note || '', id);
  },
  update(id, { description, definition_of_done, owner_founder_id, due_date, pillar }) {
    db.prepare(
      `UPDATE commitments SET description = ?, definition_of_done = ?, owner_founder_id = ?, due_date = ?, pillar = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(description, definition_of_done || '', owner_founder_id || null, due_date || null, pillar, id);
  },
  bySession(sessionId) {
    return db.prepare('SELECT * FROM commitments WHERE session_id = ? ORDER BY id').all(sessionId);
  },
  all({ status, owner_founder_id, pillar, dueBefore, dueAfter } = {}) {
    let sql = 'SELECT * FROM commitments WHERE 1=1';
    const params = [];
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (owner_founder_id) {
      sql += ' AND owner_founder_id = ?';
      params.push(owner_founder_id);
    }
    if (pillar) {
      sql += ' AND pillar = ?';
      params.push(pillar);
    }
    if (dueBefore) {
      sql += ' AND due_date <= ?';
      params.push(dueBefore);
    }
    if (dueAfter) {
      sql += ' AND due_date >= ?';
      params.push(dueAfter);
    }
    sql += ' ORDER BY (due_date IS NULL), due_date, id DESC';
    return db.prepare(sql).all(...params);
  },
  inRange(startDate, endDate) {
    return db
      .prepare(
        `SELECT c.* FROM commitments c
         LEFT JOIN sessions s ON c.session_id = s.id
         WHERE (s.date >= ? AND s.date <= ?) OR (c.due_date >= ? AND c.due_date <= ?)
         GROUP BY c.id ORDER BY c.id`
      )
      .all(startDate, endDate, startDate, endDate);
  },
};

// ---- Daily logs ----
const dailyLogs = {
  upsert(entry) {
    const existing = db
      .prepare('SELECT id FROM daily_logs WHERE date = ? AND founder_id = ?')
      .get(entry.date, entry.founder_id);
    const fields = [
      'revenue_hours',
      'revenue_evidence',
      'product_hours',
      'product_evidence',
      'distribution_hours',
      'distribution_evidence',
      'infrastructure_hours',
      'infrastructure_evidence',
      'learning_hours',
      'learning_evidence',
      'biggest_outcome',
      'biggest_problem',
      'decision_tomorrow',
    ];
    if (existing) {
      const setClause = fields.map((f) => `${f} = @${f}`).join(', ');
      db.prepare(`UPDATE daily_logs SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run({
        ...entry,
        id: existing.id,
      });
      return existing.id;
    }
    const cols = ['date', 'founder_id', ...fields];
    const placeholders = cols.map((c) => `@${c}`).join(', ');
    const info = db
      .prepare(`INSERT INTO daily_logs (${cols.join(', ')}) VALUES (${placeholders})`)
      .run(entry);
    return info.lastInsertRowid;
  },
  getByDateFounder(date, founderId) {
    return db.prepare('SELECT * FROM daily_logs WHERE date = ? AND founder_id = ?').get(date, founderId);
  },
  byDate(date) {
    return db
      .prepare(
        `SELECT dl.*, f.name AS founder_name, f.role AS founder_role
         FROM daily_logs dl JOIN founders f ON f.id = dl.founder_id
         WHERE dl.date = ? ORDER BY f.sort_order`
      )
      .all(date);
  },
  inRange(startDate, endDate) {
    return db
      .prepare(
        `SELECT dl.*, f.name AS founder_name, f.role AS founder_role
         FROM daily_logs dl JOIN founders f ON f.id = dl.founder_id
         WHERE dl.date >= ? AND dl.date <= ? ORDER BY dl.date, f.sort_order`
      )
      .all(startDate, endDate);
  },
};

module.exports = { founders, sessions, commitments, dailyLogs };
