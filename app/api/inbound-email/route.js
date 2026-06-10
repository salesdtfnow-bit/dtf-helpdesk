import { NextResponse } from 'next/server';
import { createTicket } from '../../../lib/tickets';

// Email-to-ticket endpoint.
// Works with SendGrid Inbound Parse (multipart/form-data: from, subject, text)
// and with any service that POSTs JSON: { from, subject, text }.
// Point your inbound email service at:  POST /api/inbound-email?secret=INBOUND_SECRET

function parseFrom(from) {
  // "Jane Doe <jane@example.com>" -> { name: "Jane Doe", email: "jane@example.com" }
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
  const m = /#\s?(\d{3,6})/.exec(text || '');
  return m ? `#${m[1]}` : '';
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
