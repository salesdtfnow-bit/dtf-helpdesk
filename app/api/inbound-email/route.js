import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '../../../lib/db';
import { notifySlack, appUrl } from '../../../lib/slack';

// Inbound email intake. Feeds the Email inbox (one conversation per sender).
// Does NOT auto-create tickets — staff raise a ticket from the email when needed.
// If the subject carries a [DTF-xxxx] ref, the message is also threaded into that
// ticket so ticket email replies stay complete.
// Point your inbound email service (SendGrid Inbound Parse) at:
//   POST /api/inbound-email?secret=INBOUND_SECRET

function parseFrom(from) {
  const m = /^(.*?)\s*<([^>]+)>$/.exec((from || '').trim());
  if (m) return { name: m[1].replace(/^"|"$/g, '').trim(), email: m[2].trim().toLowerCase() };
  return { name: '', email: (from || '').trim().toLowerCase() };
}

export async function POST(req) {
  const secret = process.env.INBOUND_SECRET;
  const url = new URL(req.url);
  if (secret && url.searchParams.get('secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let from = '',
    subject = '',
    text = '';
  const ctype = req.headers.get('content-type') || '';
  if (ctype.includes('application/json')) {
    const body = await req.json();
    from = body.from || '';
    subject = body.subject || '';
    text = body.text || body.body || '';
  } else {
    const form = await req.formData();
    from = String(form.get('from') || '');
    subject = String(form.get('subject') || '');
    text = String(form.get('text') || form.get('html') || '');
  }

  const { name, email } = parseFrom(from);
  if (!email) return NextResponse.json({ ok: false, error: 'no sender' });

  await ensureSchema();
  const sql = getSql();

  const [conv] = await sql`
    INSERT INTO email_conversations (email, name, last_message_at, last_inbound_at, unread, status)
    VALUES (${email}, ${name}, now(), now(), 1, 'open')
    ON CONFLICT (email) DO UPDATE SET
      last_message_at = now(), last_inbound_at = now(),
      unread = email_conversations.unread + 1, status = 'open',
      name = CASE WHEN email_conversations.name = '' THEN EXCLUDED.name ELSE email_conversations.name END
    RETURNING *`;
  await sql`INSERT INTO email_messages (conversation_id, direction, subject, body)
    VALUES (${conv.id}, 'in', ${(subject || '').slice(0, 300)}, ${(text || '').slice(0, 20000)})`;

  const link = appUrl(`/email/${conv.id}`);
  await notifySlack(
    `:email: *Email from ${name || email}*\n${subject || '(no subject)'}\n${(text || '').slice(0, 200)}` +
      (link ? `\n<${link}|Open email>` : '')
  );

  // Thread ticket replies (subject carries the ref) into the ticket too.
  const refMatch = /DTF-(\d{4,})/i.exec(subject);
  if (refMatch) {
    const ticketId = Number(refMatch[1]) - 1000;
    const [t] = await sql`SELECT * FROM tickets WHERE id = ${ticketId}`;
    if (t) {
      await sql`INSERT INTO comments (ticket_id, author, body, internal)
        VALUES (${ticketId}, ${(name || email).slice(0, 100)}, ${(text || '').slice(0, 10000)}, false)`;
      const newStatus = ['resolved', 'closed', 'waiting'].includes(t.status) ? 'open' : t.status;
      await sql`UPDATE tickets SET status = ${newStatus}, updated_at = now() WHERE id = ${ticketId}`;
    }
  }

  return NextResponse.json({ ok: true, conversation: conv.id });
}
