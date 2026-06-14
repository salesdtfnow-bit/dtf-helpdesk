import { ticketRef, LABELS, getSql, ensureSchema, hasDb } from './db';

// Posts a message to Slack via incoming webhook. No-op if not configured.
export async function notifySlack(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error('Slack notify failed:', e.message);
  }
}

function envIdMap() {
  return Object.fromEntries(
    (process.env.AGENT_SLACK_IDS || '')
      .split(',')
      .map((p) => p.split(':').map((x) => x.trim()))
      .filter((p) => p.length === 2 && p[0] && p[1])
  );
}

// Active staff names + Slack id map (DB-driven, with env fallback/merge).
async function staffSlack() {
  const idMap = envIdMap();
  let names = (process.env.AGENTS || 'Vitalijs').split(',').map((a) => a.trim()).filter(Boolean);
  if (hasDb()) {
    try {
      await ensureSchema();
      const sql = getSql();
      const rows = await sql`SELECT name, slack_id FROM staff WHERE active = true ORDER BY name ASC`;
      if (rows.length) {
        names = rows.map((r) => r.name);
        for (const r of rows) if (r.slack_id) idMap[r.name] = r.slack_id;
      }
    } catch (e) {
      console.error('staffSlack failed:', e.message);
    }
  }
  return { names, idMap };
}

function mention(name, idMap) {
  if (!name) return '';
  const id = idMap[name];
  return id ? `<@${id}>` : `*${name}*`;
}

export function appUrl(path = '') {
  const base =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '');
  return base + path;
}

export async function notifyNewTicket(t) {
  const { names, idMap } = await staffSlack();
  const link = appUrl(`/tickets/${t.id}`);
  await notifySlack(
    `:ticket: *New ticket ${ticketRef(t.id)}* — ${t.subject}\n` +
      `From: ${t.customer_name || 'Unknown'} <${t.customer_email || 'no email'}>` +
      `${t.order_number ? ` · Order ${t.order_number}` : ''}\n` +
      `Category: ${LABELS[t.category] || t.category} · Priority: ${LABELS[t.priority] || t.priority} · via ${LABELS[t.channel] || t.channel}\n` +
      `${names.map((n) => mention(n, idMap)).join(' ')}\n` +
      (link ? `<${link}|Open ticket>` : '')
  );
}

export async function notifyAssigned(t, assignee) {
  const { idMap } = await staffSlack();
  const link = appUrl(`/tickets/${t.id}`);
  await notifySlack(
    `:bust_in_silhouette: *${ticketRef(t.id)}* assigned to ${mention(assignee, idMap)} — ${t.subject}` +
      (link ? `\n<${link}|Open ticket>` : '')
  );
}

export async function notifyStatus(t, status) {
  const link = appUrl(`/tickets/${t.id}`);
  await notifySlack(
    `:arrows_counterclockwise: *${ticketRef(t.id)}* is now *${LABELS[status] || status}* — ${t.subject}` +
      (link ? `\n<${link}|Open ticket>` : '')
  );
}
