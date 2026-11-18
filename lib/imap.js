import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { getSql, ensureSchema } from './db';
import { logEvent } from './events';

// Keep each run short and safe. A run that is cut off (Vercel timeout) must never
// redo work: progress is saved after every message, overlapping runs are blocked by a
// lease, and an email we already have (same Message-ID) is never imported twice.
// (On 17 Nov 2026 runs kept timing out at 300s before saving progress; ~15 overlapping
// runs re-imported the same backlog over and over and reopened old Resolved tickets.
// The sync had been stuck ~3 months behind, on emails from August.)
const MAX_PER_RUN = 40;
const TIME_BUDGET_MS = 40_000;
const LEASE_SECONDS = 90;

// Emails older than this are skipped, not imported. If the sync ever falls behind, old
// mail (already handled in Outlook) must not flood the inbox or reopen finished tickets.
function maxAgeDays() {
  const n = Number(process.env.EMAIL_SYNC_MAX_AGE_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

// Mail from our own domains (staff forwards, copies) is kept in the Email inbox but
// never threaded into a ticket as a "customer reply".
function ownDomains() {
  return (process.env.OWN_EMAIL_DOMAINS || 'dtfnow.co.uk')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function imapConfigured() {
  return !!(process.env.IONOS_IMAP_USER && process.env.IONOS_IMAP_PASSWORD);
}

async function ensureSyncTable(sql) {
  await sql`CREATE TABLE IF NOT EXISTS email_sync_state (
    mailbox TEXT PRIMARY KEY,
    last_uid BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`ALTER TABLE email_sync_state ADD COLUMN IF NOT EXISTS uid_validity TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE email_sync_state ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`;
  await sql`CREATE INDEX IF NOT EXISTS email_messages_message_id_idx ON email_messages (message_id)`;
}

// Returns true if imported, false if skipped as a duplicate.
async function importEmail(sql, { name, email, subject, text, messageId, attachments = [] }) {
  const mid = (messageId || '').slice(0, 300);
  if (mid) {
    const [dup] = await sql`SELECT 1 FROM email_messages WHERE message_id = ${mid} LIMIT 1`;
    if (dup) return false;
  }

  const [conv] = await sql`
    INSERT INTO email_conversations (email, name, last_message_at, last_inbound_at, unread, status)
    VALUES (${email}, ${name}, now(), now(), 1, 'open')
    ON CONFLICT (email) DO UPDATE SET
      last_message_at = now(), last_inbound_at = now(),
      unread = email_conversations.unread + 1, status = 'open',
      name = CASE WHEN email_conversations.name = '' THEN EXCLUDED.name ELSE email_conversations.name END
    RETURNING *`;
  const [msg] = await sql`INSERT INTO email_messages (conversation_id, direction, subject, body, message_id)
    VALUES (${conv.id}, 'in', ${(subject || '').slice(0, 300)}, ${(text || '').slice(0, 20000)}, ${mid})
    RETURNING id`;
  for (const a of attachments) {
    if (!a || !a.content) continue;
    const size = a.size || a.content.length || 0;
    if (size > 20 * 1024 * 1024) continue;
    await sql`INSERT INTO email_attachments (conversation_id, email_message_id, filename, content_type, data, size)
      VALUES (${conv.id}, ${msg.id}, ${(a.filename || 'file').slice(0, 300)}, ${a.contentType || ''}, ${a.content}, ${size})`;
  }

  const internal = ownDomains().some((d) => email.endsWith('@' + d));
  const refMatch = internal ? null : /DTF-(\d{4,})/i.exec(subject || '');
  if (refMatch) {
    const ticketId = Number(refMatch[1]) - 1000;
    const [t] = await sql`SELECT * FROM tickets WHERE id = ${ticketId}`;
    if (t) {
      await sql`INSERT INTO comments (ticket_id, author, body, internal)
        VALUES (${ticketId}, ${(name || email).slice(0, 100)}, ${(text || '').slice(0, 10000)}, false)`;
      const ns = ['resolved', 'closed', 'waiting'].includes(t.status) ? 'open' : t.status;
      await sql`UPDATE tickets SET status = ${ns}, updated_at = now() WHERE id = ${ticketId}`;
      await logEvent(ticketId, 'Email', 'customer_reply', '', email);
      if (ns !== t.status) await logEvent(ticketId, 'Email', 'status', t.status, ns);
    }
  }
  return true;
}

export async function syncInboundEmail({ force = false } = {}) {
  if (!imapConfigured()) return { ok: false, error: 'IMAP not configured' };
  await ensureSchema();
  const sql = getSql();
  await ensureSyncTable(sql);
  const mailbox = process.env.IONOS_IMAP_USER;

  // last_uid = -1 marks a brand-new mailbox row (start from "now", never import history).
  await sql`
    INSERT INTO email_sync_state (mailbox, last_uid, updated_at)
    VALUES (${mailbox}, -1, now() - interval '1 hour')
    ON CONFLICT (mailbox) DO NOTHING`;

  // Atomically claim the lease. Only one run at a time; non-forced runs are throttled.
  const throttle = force ? sql`TRUE` : sql`updated_at < now() - interval '25 seconds'`;
  const [state] = await sql`
    UPDATE email_sync_state
    SET locked_until = now() + make_interval(secs => ${LEASE_SECONDS})
    WHERE mailbox = ${mailbox}
      AND (locked_until IS NULL OR locked_until < now())
      AND ${throttle}
    RETURNING last_uid, uid_validity`;
  if (!state) return { ok: true, skipped: true };

  const started = Date.now();
  const cutoff = new Date(Date.now() - maxAgeDays() * 24 * 60 * 60 * 1000);
  let lastUid = Number(state.last_uid);
  let validity = state.uid_validity || '';
  let imported = 0;
  let duplicates = 0;
  let skippedOld = 0;
  let more = false;
  let error = null;

  const save = () =>
    sql`UPDATE email_sync_state SET last_uid = ${lastUid}, uid_validity = ${validity} WHERE mailbox = ${mailbox}`;

  const client = new ImapFlow({
    host: process.env.IONOS_IMAP_HOST || 'imap.ionos.co.uk',
    port: Number(process.env.IONOS_IMAP_PORT || 993),
    secure: true,
    auth: { user: mailbox, pass: process.env.IONOS_IMAP_PASSWORD },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uidNext = Number(client.mailbox?.uidNext || 1);
      const currentValidity = String(client.mailbox?.uidValidity ?? '');

      if (lastUid < 0 || (validity && currentValidity && validity !== currentValidity)) {
        // First run, or the server renumbered the mailbox (e.g. after an outage/restore):
        // start from the newest message instead of re-importing the whole inbox.
        lastUid = uidNext - 1;
        validity = currentValidity;
        await save();
      } else if (validity !== currentValidity) {
        validity = currentValidity;
        await save();
      }

      if (uidNext - 1 > lastUid) {
        const range = `${lastUid + 1}:*`;
        const found = await client.search({ uid: range }, { uid: true });
        // Only messages that arrived on/after the cutoff date are imported (IMAP SINCE).
        const recentFound = await client.search({ uid: range, since: cutoff }, { uid: true });
        const recent = new Set((recentFound || []).map(Number));
        const uids = (found || [])
          .map(Number)
          .filter((u) => u > lastUid)
          .sort((a, b) => a - b);

        for (const uid of uids) {
          if (!recent.has(uid)) {
            // Too old: skip without downloading it.
            skippedOld++;
            lastUid = uid;
            continue;
          }
          if (imported + duplicates >= MAX_PER_RUN || Date.now() - started > TIME_BUDGET_MS) {
            more = true;
            break;
          }
          try {
            const m = await client.fetchOne(String(uid), { source: true }, { uid: true });
            if (m && m.source) {
              const parsed = await simpleParser(m.source);
              const fromAddr = parsed.from?.value?.[0];
              const email = (fromAddr?.address || '').toLowerCase();
              const name = fromAddr?.name || '';
              const subject = parsed.subject || '';
              let text = parsed.text || '';
              if (!text && parsed.html) {
                text = String(parsed.html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
              }
              const sentAt = parsed.date instanceof Date && !isNaN(parsed.date) ? parsed.date : null;
              if (sentAt && sentAt < cutoff) {
                // Arrived recently but was written long ago (e.g. re-delivered): skip it too.
                skippedOld++;
              } else if (email) {
                const done = await importEmail(sql, {
                  name,
                  email,
                  subject,
                  text,
                  messageId: parsed.messageId,
                  attachments: parsed.attachments || [],
                });
                if (done) imported++;
                else duplicates++;
              }
            }
          } catch (e) {
            console.error(`email import failed (uid ${uid}):`, e.message);
          }
          // Save after every message so a cut-off run never redoes work.
          lastUid = uid;
          await save();
        }
        await save();
      }
    } finally {
      lock.release();
    }
  } catch (e) {
    error = e.message;
  } finally {
    try {
      await client.logout();
    } catch {}
    try {
      await sql`UPDATE email_sync_state SET locked_until = NULL, updated_at = now() WHERE mailbox = ${mailbox}`;
    } catch (e) {
      console.error('email sync lease release failed:', e.message);
    }
  }
  if (error) return { ok: false, error, imported, duplicates, skippedOld, lastUid };
  return { ok: true, imported, duplicates, skippedOld, more, lastUid };
}
