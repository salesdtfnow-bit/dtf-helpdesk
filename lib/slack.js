import { ticketRef, LABELS } from './db';

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

export function appUrl(path = '') {
  const base =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '');
  return base + path;
}

export async function notifyNewTicket(t) {
  const link = appUrl(`/tickets/${t.id}`);
  await notifySlack(
    `:ticket: *New ticket ${ticketRef(t.id)}* — ${t.subject}\n` +
      `From: ${t.customer_name || 'Unknown'} <${t.customer_email || 'no email'}>` +
      `${t.order_number ? ` · Order ${t.order_number}` : ''}\n` +
      `Category: ${LABELS[t.category] || t.category} · Priority: ${LABELS[t.priority] || t.priority} · via ${LABELS[t.channel] || t.channel}\n` +
      (link ? `<${link}|Open ticket>` : '')
  );
}

export async function notifyAssigned(t, assignee) {
  const link = appUrl(`/tickets/${t.id}`);
  await notifySlack(
    `:bust_in_silhouette: *${ticketRef(t.id)}* assigned to *${assignee}* — ${t.subject}` +
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
