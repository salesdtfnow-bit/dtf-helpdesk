import { NextResponse } from 'next/server';
import { getSql, ensureSchema, ticketRef } from '../../../../lib/db';
import { requireAdmin } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// One-off repair for the email sync re-import loop (17 Nov 2026).
//   GET  -> dry run: counts + tickets that would be restored. Changes no data.
//   POST -> applies exactly the same plan in a single transaction (all or nothing).
// Removes only exact duplicates (the first copy is always kept) and restores tickets
// whose latest status change was an automatic "customer email reply" reopen that no
// staff member has acted on since.

// Builds temp tables (dropped at commit) holding the ids to remove. Both GET and POST
// run this, so the dry-run numbers are exactly what POST deletes.
async function buildPlan(sql) {
  // Copies of the same email (same Message-ID): keep the first.
  await sql`
    CREATE TEMP TABLE _dup_emails ON COMMIT DROP AS
    SELECT id FROM (
      SELECT id, row_number() OVER (PARTITION BY message_id ORDER BY id) AS rn
      FROM email_messages WHERE message_id <> ''
    ) x WHERE rn > 1`;

  // Identical customer comments on the same ticket, created within 6h of the first copy.
  await sql`
    CREATE TEMP TABLE _dup_comments ON COMMIT DROP AS
    SELECT id FROM (
      SELECT c.id, c.created_at,
        row_number() OVER w AS rn,
        first_value(c.created_at) OVER w AS first_at
      FROM comments c
      WHERE c.internal = false AND c.author <> 'System'
        AND c.author NOT IN (SELECT name FROM staff)
      WINDOW w AS (PARTITION BY c.ticket_id, c.author, c.body ORDER BY c.created_at, c.id)
    ) x WHERE rn > 1 AND created_at - first_at < interval '6 hours'`;

  // "Customer replied by email" history entries beyond the number of distinct emails
  // that sender actually sent on that ticket (counted from the comments that remain).
  await sql`
    CREATE TEMP TABLE _dup_events ON COMMIT DROP AS
    SELECT ev.id FROM (
      SELECT id, ticket_id, to_value,
        row_number() OVER (PARTITION BY ticket_id, to_value ORDER BY created_at, id) AS rn
      FROM ticket_events WHERE type = 'customer_reply'
    ) ev
    JOIN (
      SELECT c.ticket_id, conv.email, count(DISTINCT c.id) AS n
      FROM comments c
      JOIN email_messages em
        ON em.direction = 'in' AND md5(left(em.body, 10000)) = md5(c.body)
      JOIN email_conversations conv ON conv.id = em.conversation_id
      WHERE c.internal = false
        AND NOT EXISTS (SELECT 1 FROM _dup_comments d WHERE d.id = c.id)
        AND NOT EXISTS (SELECT 1 FROM _dup_emails d WHERE d.id = em.id)
      GROUP BY c.ticket_id, conv.email
    ) cr ON cr.ticket_id = ev.ticket_id AND cr.email = ev.to_value
    WHERE ev.rn > cr.n`;

  // Tickets reopened by a customer email whose status no staff member has touched since.
  const restore = await sql`
    WITH last_status AS (
      SELECT DISTINCT ON (ticket_id) ticket_id, from_value, to_value, actor, created_at
      FROM ticket_events WHERE type = 'status'
      ORDER BY ticket_id, created_at DESC, id DESC
    )
    SELECT t.id, t.status, ls.from_value AS restore_to, ls.created_at AS reopened_at
    FROM tickets t JOIN last_status ls ON ls.ticket_id = t.id
    WHERE ls.actor = 'Email' AND ls.to_value = 'open' AND t.status = 'open'
      AND ls.from_value IN ('resolved', 'closed', 'waiting')
      AND NOT EXISTS (
        SELECT 1 FROM ticket_events e
        WHERE e.ticket_id = t.id AND e.created_at > ls.created_at
          AND e.actor NOT IN ('Email', 'System')
      )
    ORDER BY t.id`;

  const [{ emails, comments, events }] = await sql`
    SELECT (SELECT count(*)::int FROM _dup_emails) AS emails,
           (SELECT count(*)::int FROM _dup_comments) AS comments,
           (SELECT count(*)::int FROM _dup_events) AS events`;
  return { restore, counts: { duplicateEmails: emails, duplicateComments: comments, duplicateHistory: events } };
}

async function guard() {
  try {
    await requireAdmin();
    return null;
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
}

const fmt = (rows) =>
  rows.map((r) => ({
    ref: ticketRef(r.id),
    now: r.status,
    restoreTo: r.restore_to,
    reopenedAt: r.reopened_at,
  }));

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  // Temp tables only — no data changes; they are dropped when this transaction ends.
  const plan = await getSql().begin((sql) => buildPlan(sql));
  return NextResponse.json({ dryRun: true, wouldDelete: plan.counts, wouldRestore: fmt(plan.restore) });
}

export async function POST() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const result = await getSql().begin(async (sql) => {
    const plan = await buildPlan(sql);
    const ev = await sql`DELETE FROM ticket_events WHERE id IN (SELECT id FROM _dup_events) RETURNING id`;
    const att = await sql`DELETE FROM email_attachments WHERE email_message_id IN (SELECT id FROM _dup_emails) RETURNING id`;
    const em = await sql`DELETE FROM email_messages WHERE id IN (SELECT id FROM _dup_emails) RETURNING id`;
    const cm = await sql`DELETE FROM comments WHERE id IN (SELECT id FROM _dup_comments) RETURNING id`;
    for (const r of plan.restore) {
      await sql`UPDATE tickets SET status = ${r.restore_to}, updated_at = now() WHERE id = ${r.id}`;
      await sql`INSERT INTO ticket_events (ticket_id, actor, type, from_value, to_value)
        VALUES (${r.id}, 'System', 'status', 'open', ${r.restore_to})`;
    }
    await sql`
      UPDATE email_conversations ec SET unread = LEAST(ec.unread, (
        SELECT count(*)::int FROM email_messages m WHERE m.conversation_id = ec.id AND m.direction = 'in'))`;
    return {
      planned: plan.counts,
      deleted: {
        duplicateEmails: em.length,
        duplicateAttachments: att.length,
        duplicateComments: cm.length,
        duplicateHistory: ev.length,
      },
      restored: fmt(plan.restore),
    };
  });
  return NextResponse.json({ applied: true, ...result });
}
