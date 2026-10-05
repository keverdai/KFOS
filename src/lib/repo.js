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
  getByEmail(email) {
    if (!email) return undefined;
    return db
      .prepare('SELECT * FROM founders WHERE lower(email) = lower(?)')
      .get(email.trim());
  },
  setEmail(id, email) {
    db.prepare('UPDATE founders SET email = ? WHERE id = ?').run(email.trim(), id);
  },
  setPasswordHash(id, hash) {
    db.prepare('UPDATE founders SET password_hash = ? WHERE id = ?').run(hash, id);
  },
  clearPassword(id) {
    // Founder becomes "unclaimed" again — their next successful login sets
    // a fresh password, same as first-time setup.
    db.prepare('UPDATE founders SET password_hash = NULL WHERE id = ?').run(id);
  },
};

// ---- Auth sessions ----
const authSessions = {
  create(token, founderId, expiresAt) {
    db.prepare(
      'INSERT INTO auth_sessions (token, founder_id, expires_at) VALUES (?, ?, ?)'
    ).run(token, founderId, expiresAt);
  },
  getWithFounder(token) {
    return db
      .prepare(
        `SELECT auth_sessions.token, auth_sessions.expires_at,
                founders.id AS founder_id, founders.name, founders.role,
                founders.email, founders.active
         FROM auth_sessions JOIN founders ON founders.id = auth_sessions.founder_id
         WHERE auth_sessions.token = ?`
      )
      .get(token);
  },
  delete(token) {
    db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
  },
  deleteExpired() {
    db.prepare("DELETE FROM auth_sessions WHERE expires_at < datetime('now')").run();
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
  upsert({ date, pillar, owner_founder_id, objective, discussion, decisions, updated_by_founder_id }) {
    const existing = sessions.getByDate(date);
    if (existing) {
      db.prepare(
        `UPDATE sessions SET pillar = ?, owner_founder_id = ?, objective = ?, discussion = ?, decisions = ?, updated_by_founder_id = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(pillar, owner_founder_id, objective, discussion, decisions, updated_by_founder_id || null, existing.id);
      return sessions.getById(existing.id);
    }
    const info = db
      .prepare(
        `INSERT INTO sessions (date, pillar, owner_founder_id, objective, discussion, decisions, updated_by_founder_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(date, pillar, owner_founder_id, objective, discussion, decisions, updated_by_founder_id || null);
    return sessions.getById(Number(info.lastInsertRowid));
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
  create({ session_id, pillar, description, definition_of_done, owner_founder_id, due_date, created_by_founder_id }) {
    const info = db
      .prepare(
        `INSERT INTO commitments (session_id, pillar, description, definition_of_done, owner_founder_id, due_date, created_by_founder_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session_id || null,
        pillar,
        description,
        definition_of_done || '',
        owner_founder_id || null,
        due_date || null,
        created_by_founder_id || null
      );
    return commitments.getById(Number(info.lastInsertRowid));
  },
  getById(id) {
    return db.prepare('SELECT * FROM commitments WHERE id = ?').get(id);
  },
  updateStatus(id, status, evidence, status_note, status_updated_by_founder_id) {
    db.prepare(
      `UPDATE commitments SET status = ?, evidence = ?, status_note = ?, status_updated_by_founder_id = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(status, evidence || '', status_note || '', status_updated_by_founder_id || null, id);
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
  _where({ status, owner_founder_id, pillar, dueBefore, dueAfter, attention, asOfDate } = {}) {
    let sql = ' FROM commitments WHERE 1=1';
    const params = [];
    if (attention === 'overdue') {
      sql += " AND status IN ('open', 'yellow') AND due_date IS NOT NULL AND due_date < ?";
      params.push(asOfDate);
    } else if (attention === 'due_soon') {
      sql += " AND status IN ('open', 'yellow') AND due_date IS NOT NULL AND due_date <= ?";
      params.push(dueBefore);
    } else if (status) {
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
    if (!attention && dueBefore) {
      sql += ' AND due_date <= ?';
      params.push(dueBefore);
    }
    if (dueAfter) {
      sql += ' AND due_date >= ?';
      params.push(dueAfter);
    }
    return { sql, params };
  },
  all({ status, owner_founder_id, pillar, dueBefore, dueAfter, attention, asOfDate, limit, offset } = {}) {
    const { sql: where, params } = commitments._where({
      status,
      owner_founder_id,
      pillar,
      dueBefore,
      dueAfter,
      attention,
      asOfDate,
    });
    let sql = `SELECT *${where} ORDER BY (due_date IS NULL), due_date, id DESC`;
    const queryParams = [...params];
    if (limit != null) {
      sql += ' LIMIT ?';
      queryParams.push(limit);
      if (offset) {
        sql += ' OFFSET ?';
        queryParams.push(offset);
      }
    }
    return db.prepare(sql).all(...queryParams);
  },
  count({ status, owner_founder_id, pillar, dueBefore, dueAfter, attention, asOfDate } = {}) {
    const { sql: where, params } = commitments._where({
      status,
      owner_founder_id,
      pillar,
      dueBefore,
      dueAfter,
      attention,
      asOfDate,
    });
    return Number(db.prepare(`SELECT COUNT(*) AS n${where}`).get(...params).n);
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
    return Number(info.lastInsertRowid);
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

module.exports = { founders, authSessions, sessions, commitments, dailyLogs };
