import postgres from 'postgres';

let sql = null;
let schemaReady = null;

export function hasDb() {
  return !!process.env.DATABASE_URL;
}

export function getSql() {
  if (!sql) {
    sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });
  }
  return sql;
}

export async function ensureSchema() {
  if (!schemaReady) {
    const s = getSql();
    schemaReady = (async () => {
      await s`
        CREATE TABLE IF NOT EXISTS tickets (
          id SERIAL PRIMARY KEY,
          subject TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'open',
          priority TEXT NOT NULL DEFAULT 'normal',
          category TEXT NOT NULL DEFAULT 'other',
          channel TEXT NOT NULL DEFAULT 'manual',
          customer_name TEXT NOT NULL DEFAULT '',
          customer_email TEXT NOT NULL DEFAULT '',
          order_number TEXT NOT NULL DEFAULT '',
          assignee TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await s`
        CREATE TABLE IF NOT EXISTS comments (
          id SERIAL PRIMARY KEY,
          ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
          author TEXT NOT NULL DEFAULT 'Team',
          body TEXT NOT NULL,
          internal BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
    })();
  }
  return schemaReady;
}

export function ticketRef(id) {
  return `DTF-${1000 + Number(id)}`;
}

export const STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
export const CATEGORIES = [
  'print_quality',
  'artwork_issue',
  'reprint_request',
  'shipping',
  'order_change',
  'billing',
  'other',
];

export const LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  waiting: 'Waiting on customer',
  resolved: 'Resolved',
  closed: 'Closed',
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
  print_quality: 'Print quality',
  artwork_issue: 'Artwork / file issue',
  reprint_request: 'Reprint request',
  shipping: 'Shipping / delivery',
  order_change: 'Order change / cancel',
  billing: 'Billing',
  other: 'Other',
  email: 'Email',
  form: 'Web form',
  slack: 'Slack',
  shopify: 'Shopify',
  manual: 'Manual',
};

export function agents() {
  return (process.env.AGENTS || 'Vitaly')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
}
