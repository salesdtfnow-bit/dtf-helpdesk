import { NextResponse } from 'next/server';
import { createTicket } from '../../../lib/tickets';
import { getSql, ticketRef } from '../../../lib/db';
import { relayFilesToUploader, uploadsConfigured } from '../../../lib/uploads';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// Public endpoint for the Shopify storefront support form. Creates a ticket and
// relays any attached artwork to the Files Uploader.
export async function POST(req) {
  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad form' }, { status: 400, headers: CORS });
  }
  // Honeypot: bots fill hidden 'company' field.
  if (String(form.get('company') || '').trim()) {
    return NextResponse.json({ ok: true }, { headers: CORS });
  }
  const subject = String(form.get('subject') || '').trim();
  const description = String(form.get('description') || '').trim();
  const customer_name = String(form.get('customer_name') || '').trim();
  const customer_email = String(form.get('customer_email') || '').trim();
  const order_number = String(form.get('order_number') || '').trim();
  const category = String(form.get('category') || 'other');
  if (!subject || !customer_email || !order_number) {
    return NextResponse.json(
      { ok: false, error: 'Subject, email and order number are required.' },
      { status: 400, headers: CORS }
    );
  }

  const t = await createTicket({
    subject,
    description,
    category,
    channel: 'form',
    customer_name,
    customer_email,
    order_number,
  });

  const files = form.getAll('files').filter((f) => typeof f !== 'string' && f && f.size > 0);
  if (files.length > 0) {
    const sql = getSql();
    if (!uploadsConfigured()) {
      await sql`INSERT INTO comments (ticket_id, author, body, internal)
        VALUES (${t.id}, 'System', ${'Customer attached ' + files.length + ' file(s) but file storage is not configured.'}, true)`;
    } else {
      const result = await relayFilesToUploader({ name: customer_name, email: customer_email, orderNumber: order_number, files });
      const body = result.ok
        ? `Customer uploaded ${(result.fileNames || []).length || files.length} file(s) via the support form: ${(result.fileNames || []).join(', ')}`
        : `File upload issue: ${result.error || 'unknown'}`;
      await sql`INSERT INTO comments (ticket_id, author, body, internal)
        VALUES (${t.id}, 'System', ${body.slice(0, 5000)}, ${!result.ok})`;
    }
  }

  return NextResponse.json({ ok: true, ref: ticketRef(t.id) }, { headers: CORS });
}
