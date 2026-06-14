import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { getSql, ensureSchema } from './db';
import { notifySlack, appUrl } from './slack';

export function imapConfigured() {
  return !!(process.env.IONOS_IMAP_USER && process.env.IONOS_IMAP_PASSWORD);
}

async function ensureSyncTable(sql) {
  await sql`CREATE TABLE IF NOT EXISTS email_sync_state (
    mailbox TEXT PRIMARY KEY,
    last_uid BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
}

async function importEmail(sql, { name, email, subject, text, messageId }) {
  const [conv] = await sql`
    INSERT INTO email_conversations (email, name, last_message_at, last_inbound_at, unread, status)
    VALUES (${email}, ${name}, now(), now(), 1, 'open')
    ON CONFLICT (email) DO UPDATE SET
      last_message_at = now(), last_inbound_at = now(),
      unread = email_conversations.unread + 1, status = 'open',
      name = CASE WHEN email_conversations.name = '' THEN EXCLUDED.name ELSE email_conversations.name END
    RETURNING *`;
  await sql`INSERT INTO email_messages (conversation_id, direction, subject, body, message_id)
    VALUES (${conv.id}, 'in', ${(subject || '').slice(0, 300)}, ${(text || '').slice(0, 20000)}, ${(messageId || '').slice(0, 300)})`;
  const link = appUrl(`/email/${conv.id}`);
  await notifySlack(
    `:email: *Email from ${name || email}*\n${subject || '(no subject)'}\n${(text || '').slice(0, 200)}` +
      (link ? `\n<${link}|Open email>` : '')
  );
  const refMatch = /DTF-(\d{4,})/i.exec(subject || '');
  if (refMatch) {
    const ticketId = Number(refMatch[1]) - 1000;
    const [t] = await sql`SELECT * FROM tickets WHERE id = ${ticketId}`;
    if (t) {
      await sql`INSERT INTO comments (ticket_id, author, body, internal)
        VALUES (${ticketId}, ${(name || email).slice(0, 100)}, ${(text || '').slice(0, 10000)}, false)`;
      const ns = ['resolved', 'closed', 'waiting'].includes(t.status) ? 'open' : t.status;
      await sql`UPDATE tickets SET status = ${ns}, updated_at = now() WHERE id = ${ticketId}`;
    }
  }
}

// Read-only incremental sync of new INBOX mail into the email inbox.
// First run sets a baseline (no history imported); later runs import mail with a
// higher UID. Throttled so frequent page refreshes do not hammer the mailbox.
export async function syncInboundEmail({ force = false } = {}) {
  if (!imapConfigured()) return { ok: false, error: 'IMAP not configured' };
  await ensureSchema();
  const sql = getSql();
  await ensureSyncTable(sql);
  const mailbox = process.env.IONOS_IMAP_USER;
  const [state] = await sql`SELECT last_uid, updated_at FROM email_sync_state WHERE mailbox = ${mailbox}`;
  if (!force && state && Date.now() - new Date(state.updated_at).getTime() < 25000) {
    return { ok: true, skipped: true };
  }

  const client = new ImapFlow({
    host: process.env.IONOS_IMAP_HOST || 'imap.ionos.co.uk',
    port: Number(process.env.IONOS_IMAP_PORT || 993),
    secure: true,
    auth: { user: mailbox, pass: process.env.IONOS_IMAP_PASSWORD },
    logger: false,
  });

  let imported = 0;
  let newLastUid = state?.last_uid ? Number(state.last_uid) : 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uidNext = client.mailbox?.uidNext || 1;
      if (!state) {
        newLastUid = uidNext - 1; // baseline: capture from now on
      } else {
        const lastUid = Number(state.last_uid);
        if (uidNext - 1 > lastUid) {
          for await (const msg of client.fetch(`${lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
            if (!msg.uid || msg.uid <= lastUid) continue;
            try {
              const parsed = await simpleParser(msg.source);
              const fromAddr = parsed.from?.value?.[0];
              const email = (fromAddr?.address || '').toLowerCase();
              const name = fromAddr?.name || '';
              const subject = parsed.subject || '';
              let text = parsed.text || '';
              if (!text && parsed.html) {
                text = String(parsed.html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
              }
              if (email) {
                await importEmail(sql, { name, email, subject, text, messageId: parsed.messageId });
                imported++;
              }
            } catch (e) {
              console.error('email parse failed:', e.message);
            }
            if (msg.uid > newLastUid) newLastUid = msg.uid;
          }
        }
      }
      await sql`
        INSERT INTO email_sync_state (mailbox, last_uid, updated_at)
        VALUES (${mailbox}, ${newLastUid}, now())
        ON CONFLICT (mailbox) DO UPDATE SET last_uid = ${newLastUid}, updated_at = now()`;
    } finally {
      lock.release();
    }
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try {
      await client.logout();
    } catch {}
  }
  return { ok: true, imported, lastUid: newLastUid };
}
