// Password hashing using Node's built-in crypto (scrypt) — no extra
// dependency (e.g. bcrypt) needed. Stored format: "salt:hash", both hex.

const crypto = require('crypto');

const KEY_LEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, KEY_LEN);
  return `${salt}:${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hashHex] = stored.split(':');
  let derived;
  try {
    derived = crypto.scryptSync(password, salt, KEY_LEN);
  } catch {
    return false;
  }
  const stored_ = Buffer.from(hashHex, 'hex');
  if (stored_.length !== derived.length) return false;
  return crypto.timingSafeEqual(stored_, derived);
}

module.exports = { hashPassword, verifyPassword };
