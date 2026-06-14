import { getSql, ensureSchema } from './db';
import { notifyNewTicket } from './slack';

const VALID = {
  status: ['open', 'in_progress', 'waiting', 'resolved', 'closed'],
  priority: ['low', 'normal', 'high', 'urgent'],
  category: [
    'print_quality',
    'artwork_issue',
    'reprint_request',
    'shipping',
    'order_change',
    'billing',
    'other',
  ],
  channel: ['email', 'form', 'slack', 'shopify', 'whatsapp', 'manual'],
};

function clean(value, list, fallback) {
  return list.includes(value) ? value : fallback;
}

function defaultPriority(category) {
  return ['reprint_request', 'print_quality'].includes(category) ? 'high' : 'normal';
}

export async function createTicket(input) {
  await ensureSchema();
  const sql = getSql();
  const category = clean(input.category, VALID.category, 'other');
  const [t] = await sql`
    INSERT INTO tickets (subject, description, status, priority, category, channel,
                         customer_name, customer_email, order_number, assignee)
    VALUES (
      ${(input.subject || 'No subject').slice(0, 300)},
      ${(input.description || '').slice(0, 10000)},
      'open',
      ${clean(input.priority, VALID.priority, defaultPriority(category))},
      ${category},
      ${clean(input.channel, VALID.channel, 'manual')},
      ${(input.customer_name || '').slice(0, 200)},
      ${(input.customer_email || '').slice(0, 200)},
      ${(input.order_number || '').slice(0, 50)},
      ${(input.assignee || '').slice(0, 100)}
    )
    RETURNING *`;
  await notifyNewTicket(t);
  return t;
}
