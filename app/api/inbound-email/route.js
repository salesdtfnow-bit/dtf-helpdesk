import { NextResponse } from 'next/server';
import { createTicket } from '../../../lib/tickets';
import { getSql, ensureSchema, ticketRef } from '../../../lib/db';
import { notifySlack, appUrl } from '../../../lib/slack';

// Email-to-ticket endpoint.
// Works with SendGrid Inbound Parse (multipart/form-data: from, subject, text)
// and with any service that POSTs JSON: { from, subject, text }.
// Replies containing a [DTF-xxxx] ref in the subject are threaded into the
// existing ticket instead of opening a new one.
// Point your inbound email service at:  POST /api/inbound-email?secret=INBOUND_SECRET

function parseFrom(from) {
  const m = /^(.*?)\s*<([^>]+)>$/.exec((from || '').trim());
  if (m) return { name: m[1].replace(/^"|"$/g, ''), email: m[2] };
  return { name: '', email: (from || '').trim() };
}

function guessCategory(text) {
  const t = (text || '').toLowerCase();
  if (/(reprint|re-print|replacement)/.test(t)) return 'reprint_request';
  if (/(peel|crack|wash|fade|quality|blurry|colour|color)/.test(t)) return 'print_quality';
  if (/(artwork|file|png|resolution|dpi|transparent)/.test(t)) return 'artwork_issue';
  if (/(deliver|shipping|tracking|royal mail|dpd|courier|arrive)/.test(t)) return 'shipping';
  if (/(cancel|change.*order|wrong size|wrong address)/.test(t)) return 'order_change';
  if (/(refund|invoice|charge|payment|vat)/.test(t)) return 'billing';
  return 'other';
}

function extractOrderNumber(text) {
  const m = /#?\s?(DTFN\d{3,8})/i.exec(text || '');
  if (m) return `#${m[1].toUpperCase()}`;
  const n = /#\s?(\d{3,6})/.exec(text || '');
  return n ? `#${n[1]}` : '';
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

  // Thread replies into the existing ticket when the subject carries our ref.
  const refMatch = /DTF-(\d{4,})/i.exec(subject);
  if (refMatch) {
    const ticketId = Number(refMatch[1]) - 1000;
    await ensureSchema();
    const sql = getSql();
    const [t] = await sql`SELECT * FROM tickets WHERE id = ${ticketId}`;
    if (t) {
      await sql`INSERT INTO comments (ticket_id, author, body, internal)
        VALUES (${ticketId}, ${(name || email || 'Customer').slice(0, 100)}, ${text.slice(0, 10000)}, false)`;
      const newStatus = ['resolved', 'closed', 'waiting'].includes(t.status) ? 'open' : t.status;
      await sql`UPDATE tickets SET status = ${newStatus}, updated_at = now() WHERE id = ${ticketId}`;
      const link = appUrl(`/tickets/${ticketId}`);
      await notifySlack(
        `:email: Customer replied on *${ticketRef(ticketId)}* — ${t.subject}` +
          (link ? `\n<${link}|Open ticket>` : '')
      );
      return NextResponse.json({ ok: true, threaded: true, id: ticketId });
    }
  }

  const combined = `${subject}\n${text}`;
  const t = await createTicket({
    subject: subject || '(no subject)',
    description: text.slice(0, 10000),
    channel: 'email',
    category: guessCategory(combined),
    customer_name: name,
    customer_email: email,
    order_number: extractOrderNumber(combined),
  });
  return NextResponse.json({ ok: true, id: t.id });
}
