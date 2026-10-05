// One-off commitment notifications — e.g. "tell the owner about this task"
// — triggered only by someone clicking a button (lib/mailer.js's queueMail
// keeps that click from waiting on SMTP). Separate from lib/digest.js's
// recurring overdue/due-soon summary: this is about a single commitment.

const mailer = require('./mailer');
const { getPillar } = require('./pillars');

function appUrl(path) {
  const base = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
}

function esc(s) {
  return String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// commitment: a row from repo.commitments; owner/actor: founder rows
// (actor may be null if unknown). Queues the send and returns immediately.
function queueCommitmentNotification(commitment, owner, actor) {
  const pillar = getPillar(commitment.pillar);
  const dueLine = commitment.due_date ? `Due: ${commitment.due_date}` : 'No due date set';
  const fromLine = actor ? `${actor.name} flagged this for you` : 'New commitment';

  const subject = `KFOS task: ${commitment.description}`;
  const text = [
    `Hi ${owner.name},`,
    '',
    fromLine,
    `${pillar ? pillar.label : commitment.pillar}: ${commitment.description}`,
    commitment.definition_of_done ? `Definition of done: ${commitment.definition_of_done}` : null,
    dueLine,
    '',
    `Commitments board: ${appUrl('/commitments')}`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  const html = `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; color:#111; max-width:560px;">
      <p style="margin:0 0 16px;">Hi ${esc(owner.name)},</p>
      <p style="margin:0 0 4px;">${esc(fromLine)}</p>
      <p style="margin:0 0 4px;"><strong>${esc(pillar ? pillar.label : commitment.pillar)}:</strong> ${esc(commitment.description)}</p>
      ${commitment.definition_of_done ? `<p style="margin:0 0 4px;">Definition of done: ${esc(commitment.definition_of_done)}</p>` : ''}
      <p style="margin:0 0 12px;">${esc(dueLine)}</p>
      <p style="margin:16px 0 0;"><a href="${esc(appUrl('/commitments'))}">Open the commitments board &rarr;</a></p>
    </div>
  `;

  mailer.queueMail({ to: owner.email, subject, html, text });
}

module.exports = { queueCommitmentNotification };
