// Daily email digest: for each founder with an email on file, what's
// overdue, what's due soon, and what today's session is about — sent via
// lib/mailer.js. Built entirely from existing data/queries (lib/repo.js'
// attention-based commitment filters, lib/rotation.js, lib/pillars.js); no
// new state beyond the mailer itself.

const repo = require('./repo');
const rotation = require('./rotation');
const settings = require('./settings');
const mailer = require('./mailer');
const { getPillar } = require('./pillars');

const DUE_SOON_WINDOW_DAYS = 3;

function appUrl(path) {
  const base = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
}

function esc(s) {
  return String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// null on a weekend or if the weekday has no pillar mapped; otherwise the
// pillar/owner/session row for today, same inputs today.js already uses.
function buildTodaySessionInfo(dateStr, founders) {
  if (rotation.isWeekend(dateStr)) return null;
  const pillarKey = rotation.getPillarKeyForDate(dateStr);
  if (!pillarKey) return null;
  const pillar = getPillar(pillarKey);
  const owner = rotation.getOwnerForDate(dateStr, founders);
  const session = repo.sessions.getByDate(dateStr);
  return { pillar, owner, session };
}

function commitmentLine(c) {
  const due = c.due_date ? ` — due ${c.due_date}` : '';
  return `${c.description}${due}`;
}

function sessionSection(sessionInfo, founder) {
  if (!sessionInfo) {
    return { textLines: [], htmlRows: [] };
  }
  const { pillar, owner, session } = sessionInfo;
  const isOwner = owner && owner.id === founder.id;
  const ownerLine = owner
    ? isOwner
      ? "You're running today's session."
      : `${owner.name} is running today's session.`
    : 'No session owner set.';
  const topic = session && session.objective ? session.objective : pillar.question;
  const textLines = [
    `Today's session: ${pillar.emoji} ${pillar.label}`,
    ownerLine,
    `Discuss: ${topic}`,
  ];
  const htmlRows = [
    `<p style="margin:0 0 4px;"><strong>Today's session: ${esc(pillar.emoji)} ${esc(pillar.label)}</strong></p>`,
    `<p style="margin:0 0 4px;">${esc(ownerLine)}</p>`,
    `<p style="margin:0 0 12px;">Discuss: ${esc(topic)}</p>`,
  ];
  return { textLines, htmlRows };
}

function listSection(title, items, emptyText) {
  if (items.length === 0) {
    return {
      text: `${title}: ${emptyText}`,
      html: `<p style="margin:0 0 12px;"><strong>${esc(title)}:</strong> ${esc(emptyText)}</p>`,
    };
  }
  const text = `${title} (${items.length}):\n` + items.map((c) => `  - ${commitmentLine(c)}`).join('\n');
  const html =
    `<p style="margin:0 0 4px;"><strong>${esc(title)} (${items.length})</strong></p>` +
    `<ul style="margin:0 0 12px; padding-left:20px;">` +
    items.map((c) => `<li>${esc(commitmentLine(c))}</li>`).join('') +
    `</ul>`;
  return { text, html };
}

// Always returns a digest ({subject, html, text}) — callers decide whether
// an all-clear, no-session digest is worth sending (see sendDailyDigest).
function buildFounderDigest(founder, dateStr, sessionInfo) {
  const overdue = repo.commitments.all({
    attention: 'overdue',
    asOfDate: dateStr,
    owner_founder_id: founder.id,
  });
  const dueSoon = repo.commitments.all({
    attention: 'due_soon',
    dueBefore: rotation.addDays(dateStr, DUE_SOON_WINDOW_DAYS),
    dueAfter: dateStr,
    owner_founder_id: founder.id,
  });

  const companyName = settings.get('company_name', 'Keverd');
  const subjectBits = [];
  if (overdue.length) subjectBits.push(`${overdue.length} overdue`);
  if (dueSoon.length) subjectBits.push(`${dueSoon.length} due soon`);
  if (sessionInfo) subjectBits.push(`today: ${sessionInfo.pillar.label}`);
  const subject = `KFOS — ${subjectBits.length ? subjectBits.join(' · ') : 'all clear'}`;

  const session = sessionSection(sessionInfo, founder);
  const overdueSection = listSection('Overdue', overdue, 'nothing overdue.');
  const dueSoonSection = listSection(
    `Due in the next ${DUE_SOON_WINDOW_DAYS} days`,
    dueSoon,
    'nothing due soon.'
  );

  const text = [
    `Hi ${founder.name},`,
    '',
    ...session.textLines,
    '',
    overdueSection.text,
    '',
    dueSoonSection.text,
    '',
    `Commitments board: ${appUrl('/commitments')}`,
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; color:#111; max-width:560px;">
      <p style="margin:0 0 16px;">Hi ${esc(founder.name)},</p>
      ${session.htmlRows.join('')}
      ${overdueSection.html}
      ${dueSoonSection.html}
      <p style="margin:16px 0 0;"><a href="${esc(appUrl('/commitments'))}">Open the commitments board &rarr;</a></p>
    </div>
  `;

  return { subject, html, text, companyName, overdue, dueSoon, hasSession: Boolean(sessionInfo) };
}

// { onlyFounderId, force } -> array of { founder, email, sent, skipped?, error? }
// - onlyFounderId: send to just that one founder (e.g. a "send me a preview" button)
// - force: send even when there's nothing overdue/due soon and no session today
//   (so a manual test send always produces an email)
async function sendDailyDigest({ onlyFounderId, force = false } = {}) {
  const dateStr = rotation.todayStr();
  const allFounders = repo.founders.all(true);
  const recipients = allFounders.filter((f) => f.email && (!onlyFounderId || f.id === onlyFounderId));
  const sessionInfo = buildTodaySessionInfo(dateStr, allFounders);

  const results = [];
  for (const founder of recipients) {
    const digest = buildFounderDigest(founder, dateStr, sessionInfo);
    const nothingToReport = digest.overdue.length === 0 && digest.dueSoon.length === 0 && !digest.hasSession;
    if (nothingToReport && !force) {
      results.push({ founder: founder.name, email: founder.email, sent: false, skipped: 'nothing-to-report' });
      continue;
    }
    const result = await mailer.sendMail({
      to: founder.email,
      subject: digest.subject,
      html: digest.html,
      text: digest.text,
    });
    results.push({ founder: founder.name, email: founder.email, ...result });
  }
  return results;
}

module.exports = { buildTodaySessionInfo, buildFounderDigest, sendDailyDigest };
