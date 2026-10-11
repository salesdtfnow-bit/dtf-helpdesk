import { ticketRef, LABELS, getSql, ensureSchema, hasDb } from './db';

// Team notifications go to Discord (#dtfnow-ticket) through a channel webhook.
// Set DISCORD_WEBHOOK_URL (Discord: channel settings → Integrations → Webhooks → Copy Webhook URL).
// No-op if it isn't set.

const MAX = 2000; // Discord message limit

// Customer-supplied text (subject, name) must not be able to change the formatting.
// (Pings are blocked separately by allowed_mentions, so emails stay copyable.)
function esc(s) {
  return String(s ?? '')
    .replace(/[\\*_~`|\[\]()]/g, (c) => '\\' + c)
    .replace(/\s+/g, ' ')
    .trim();
}

export async function notifyTeam(content, userIds = []) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  const body = {
    username: 'DTF Now Helpdesk',
    content: content.length > MAX ? content.slice(0, MAX - 1) + '…' : content,
    // Only ping the staff we name; never @everyone/@here or roles.
    allowed_mentions: { parse: [], users: [...new Set(userIds)].slice(0, 100) },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error('Discord notify failed:', res.status, (await res.text()).slice(0, 200));
  } catch (e) {
    console.error('Discord notify failed:', e.message);
  }
}

function envIdMap() {
  return Object.fromEntries(
    (process.env.AGENT_DISCORD_IDS || '')
      .split(',')
      .map((p) => p.split(':').map((x) => x.trim()))
      .filter((p) => p.length === 2 && p[0] && /^\d{15,25}$/.test(p[1]))
  );
}

// Active staff names + Discord user id map (DB-driven, with env fallback/merge).
async function staffDiscord() {
  const idMap = envIdMap();
  let names = (process.env.AGENTS || 'Vitalijs').split(',').map((a) => a.trim()).filter(Boolean);
  if (hasDb()) {
    try {
      await ensureSchema();
      const sql = getSql();
      const rows = await sql`SELECT name, discord_id FROM staff WHERE active = true ORDER BY name ASC`;
      if (rows.length) {
        names = rows.map((r) => r.name);
        for (const r of rows) if (/^\d{15,25}$/.test(r.discord_id || '')) idMap[r.name] = r.discord_id;
      }
    } catch (e) {
      console.error('staffDiscord failed:', e.message);
    }
  }
  return { names, idMap };
}

function mention(name, idMap) {
  if (!name) return '';
  const id = idMap[name];
  return id ? `<@${id}>` : `**${esc(name)}**`;
}

const idsFor = (names, idMap) => names.map((n) => idMap[n]).filter(Boolean);

// <...> around the URL stops Discord from adding a big link preview.
const openLink = (link) => (link ? `\n[Open ticket](<${link}>)` : '');

export function appUrl(path = '') {
  const base =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '');
  return base + path;
}

export async function notifyNewTicket(t) {
  const { names, idMap } = await staffDiscord();
  const link = appUrl(`/tickets/${t.id}`);
  await notifyTeam(
    `🎫 **New ticket ${ticketRef(t.id)}** — ${esc(t.subject)}\n` +
      `From: ${esc(t.customer_name || 'Unknown')} (${esc(t.customer_email || 'no email')})` +
      `${t.order_number ? ` · Order ${esc(t.order_number)}` : ''}\n` +
      `Category: ${LABELS[t.category] || esc(t.category)} · Priority: ${LABELS[t.priority] || esc(t.priority)} · via ${LABELS[t.channel] || esc(t.channel)}\n` +
      `${names.map((n) => mention(n, idMap)).join(' ')}` +
      openLink(link),
    idsFor(names, idMap)
  );
}

export async function notifyAssigned(t, assignee) {
  const { idMap } = await staffDiscord();
  const link = appUrl(`/tickets/${t.id}`);
  await notifyTeam(
    `👤 **${ticketRef(t.id)}** assigned to ${mention(assignee, idMap)} — ${esc(t.subject)}` + openLink(link),
    idsFor([assignee], idMap)
  );
}

export async function notifyStatus(t, status) {
  const link = appUrl(`/tickets/${t.id}`);
  await notifyTeam(
    `🔄 **${ticketRef(t.id)}** is now **${LABELS[status] || esc(status)}** — ${esc(t.subject)}` + openLink(link)
  );
}

export async function notifyReprint(id, orderNumber) {
  await notifyTeam(`🔁 Reprint raised from ticket **${ticketRef(id)}**${orderNumber ? ` (order ${esc(orderNumber)})` : ''}`);
}
