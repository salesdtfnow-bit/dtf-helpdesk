import { getSql, ensureSchema, LABELS } from './db';
import { currentUser } from './auth';

// Ticket history. Logging is best-effort: it must never break the action that
// triggered it, so every failure is swallowed (and logged to the console).
export async function logEvent(ticketId, actor, type, from = '', to = '') {
  try {
    const id = Number(ticketId);
    if (!id || !type) return;
    await ensureSchema();
    const sql = getSql();
    await sql`
      INSERT INTO ticket_events (ticket_id, actor, type, from_value, to_value)
      VALUES (${id}, ${String(actor || 'System').slice(0, 100)}, ${String(type).slice(0, 50)},
              ${String(from ?? '').slice(0, 500)}, ${String(to ?? '').slice(0, 500)})`;
  } catch (e) {
    console.error('logEvent failed:', e.message);
  }
}

// Name of the signed-in staff member, or the fallback when there isn't one.
export async function currentActor(fallback = 'System') {
  try {
    const u = await currentUser();
    return u?.name || fallback;
  } catch {
    return fallback;
  }
}

function label(v) {
  return LABELS[v] || v || '—';
}

// Plain-English description of an event, for the ticket History card.
export function describeEvent(e) {
  const who = e.actor || 'System';
  const from = e.from_value || '';
  const to = e.to_value || '';
  switch (e.type) {
    case 'created':
      return `${who} created the ticket${to ? ` via ${label(to)}` : ''}`;
    case 'status':
      if (who === 'Email') return `Customer email reply moved status ${label(from)} → ${label(to)}`;
      return `${who} changed status ${label(from)} → ${label(to)}`;
    case 'priority':
      return `${who} changed priority ${label(from)} → ${label(to)}`;
    case 'assign':
      if (!to) return `${who} unassigned the ticket${from ? ` (was ${from})` : ''}`;
      if (!from) return `${who} assigned the ticket to ${to}`;
      return `${who} reassigned the ticket ${from} → ${to}`;
    case 'reply':
      return `${who} sent a public reply`;
    case 'note':
      return `${who} added an internal note`;
    case 'email_sent':
      return `${who} emailed the customer`;
    case 'reprint':
      return `${who} raised a reprint`;
    case 'reprint_failed':
      return `${who} tried to raise a reprint (failed)`;
    case 'upload_link':
      return `${who} emailed the customer the upload link`;
    case 'edited':
      return `${who} edited the ${to || 'ticket'}`;
    case 'customer_reply':
      return `Customer replied by email${to ? ` (${to})` : ''}`;
    default:
      return `${who}: ${e.type}${from || to ? ` ${from} → ${to}` : ''}`;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Compact timestamp, e.g. "30 Sep 14:02" (server time zone, like the rest of the app).
export function shortTime(value) {
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Compact date, e.g. "30 Sep 2026".
export function shortDate(value) {
  const d = new Date(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
