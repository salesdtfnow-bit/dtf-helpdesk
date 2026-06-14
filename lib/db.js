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
      await s`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reprint_id TEXT NOT NULL DEFAULT ''`;
      await s`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reprint_token TEXT NOT NULL DEFAULT ''`;
      await s`
        CREATE TABLE IF NOT EXISTS comments (
          id SERIAL PRIMARY KEY,
          ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
          author TEXT NOT NULL DEFAULT 'Team',
          body TEXT NOT NULL,
          internal BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await s`
        CREATE TABLE IF NOT EXISTS customer_notes (
          id SERIAL PRIMARY KEY,
          email TEXT NOT NULL,
          author TEXT NOT NULL DEFAULT 'Team',
          body TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await s`
        CREATE TABLE IF NOT EXISTS shop_tokens (
          shop TEXT PRIMARY KEY,
          token TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      // Staff (login + assignee list). Roles: admin, agent.
      await s`
        CREATE TABLE IF NOT EXISTS staff (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL DEFAULT '',
          role TEXT NOT NULL DEFAULT 'agent',
          slack_id TEXT NOT NULL DEFAULT '',
          active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      const [{ count: staffCount }] = await s`SELECT COUNT(*)::int AS count FROM staff`;
      if (staffCount === 0) {
        await s`INSERT INTO staff (name, email, role, slack_id) VALUES
          ('Vitalijs', 'sales@dtfnow.co.uk', 'admin', 'U05U0RP8QQ1'),
          ('Ella', 'ella@dtfnow.co.uk', 'agent', 'U0B771G4DGB'),
          ('Hannah', 'hannah@dtfnow.co.uk', 'agent', 'U0B6V4DFCKH'),
          ('Elisabeth', 'elisabeth@dtfnow.co.uk', 'agent', 'U0B7X36DL06')`;
      }
      // WhatsApp live chat
      await s`
        CREATE TABLE IF NOT EXISTS wa_conversations (
          id SERIAL PRIMARY KEY,
          wa_id TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL DEFAULT '',
          assignee TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'open',
          unread INTEGER NOT NULL DEFAULT 0,
          last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_inbound_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await s`
        CREATE TABLE IF NOT EXISTS wa_messages (
          id SERIAL PRIMARY KEY,
          conversation_id INTEGER NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
          wa_message_id TEXT NOT NULL DEFAULT '',
          direction TEXT NOT NULL DEFAULT 'in',
          body TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT '',
          author TEXT NOT NULL DEFAULT '',
          edited BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await s`ALTER TABLE wa_messages ADD COLUMN IF NOT EXISTS edited BOOLEAN NOT NULL DEFAULT false`;
      // Email inbox (mirrors WhatsApp): one conversation per customer email.
      await s`
        CREATE TABLE IF NOT EXISTS email_conversations (
          id SERIAL PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL DEFAULT '',
          assignee TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'open',
          unread INTEGER NOT NULL DEFAULT 0,
          last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_inbound_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await s`
        CREATE TABLE IF NOT EXISTS email_messages (
          id SERIAL PRIMARY KEY,
          conversation_id INTEGER NOT NULL REFERENCES email_conversations(id) ON DELETE CASCADE,
          direction TEXT NOT NULL DEFAULT 'in',
          subject TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          message_id TEXT NOT NULL DEFAULT '',
          author TEXT NOT NULL DEFAULT '',
          edited BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      // Canned replies
      await s`
        CREATE TABLE IF NOT EXISTS canned_replies (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      const [{ count }] = await s`SELECT COUNT(*)::int AS count FROM canned_replies`;
      if (count === 0) {
        await s`INSERT INTO canned_replies (title, body) VALUES
          ('Press settings', ${'Our DTF transfers press at 150C for 15 seconds with medium-firm pressure. Peel cold for the best finish, then re-press for 5 seconds with a cover sheet to lock it in.'}),
          ('Wash care', ${'For longest life, wash inside-out at 30C, avoid harsh detergents and fabric softener, and do not tumble dry. Iron inside-out only, never directly on the print.'}),
          ('File specs', ${'Please send artwork as a PNG with a transparent background at 300 DPI, sized to the exact print dimensions you need. That gives us the cleanest, sharpest transfer.'}),
          ('Reprint being arranged', ${'Sorry for the trouble with your order. We are arranging a reprint now and will send you a tracking link as soon as it is on its way. You do not need to do anything further.'})`;
      }
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
  whatsapp: 'WhatsApp',
  manual: 'Manual',
};

// Env fallback list of agents (used only when the DB/staff table is unavailable).
export function agents() {
  return (process.env.AGENTS || 'Vitalijs')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
}
