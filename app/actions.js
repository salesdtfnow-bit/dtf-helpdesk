'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSql, ensureSchema, ticketRef } from '../lib/db';
import { createTicket } from '../lib/tickets';
import { notifyAssigned, notifyStatus, notifySlack, appUrl } from '../lib/slack';
import { sendCustomerEmail } from '../lib/email';
import { createReprint, reprintConfigured } from '../lib/reprint';

export async function createTicketAction(formData) {
  const t = await createTicket({
    subject: formData.get('subject'),
    description: formData.get('description'),
    category: formData.get('category'),
    priority: formData.get('priority'),
    channel: formData.get('channel') || 'manual',
    customer_name: formData.get('customer_name'),
    customer_email: formData.get('customer_email'),
    order_number: formData.get('order_number'),
    assignee: formData.get('assignee'),
  });
  redirect(`/tickets/${t.id}`);
}

export async function publicTicketAction(formData) {
  const needsFiles = formData.get('needs_files') === 'on';
  const t = await createTicket({
    subject: formData.get('subject'),
    description: formData.get('description'),
    category: formData.get('category'),
    channel: 'form',
    customer_name: formData.get('customer_name'),
    customer_email: formData.get('customer_email'),
    order_number: formData.get('order_number'),
  });
  // Send customers with artwork straight to the uploader after submitting.
  redirect(needsFiles ? '/thanks?upload=1' : '/thanks');
}

export async function assignAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const assignee = String(formData.get('assignee') || '');
  const [t] = await sql`
    UPDATE tickets SET assignee = ${assignee}, updated_at = now()
    WHERE id = ${id} RETURNING *`;
  if (t && assignee) await notifyAssigned(t, assignee);
  revalidatePath(`/tickets/${id}`);
  revalidatePath('/tickets');
}

export async function statusAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const status = String(formData.get('status'));
  const allowed = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];
  if (!allowed.includes(status)) return;
  const [t] = await sql`
    UPDATE tickets SET status = ${status}, updated_at = now()
    WHERE id = ${id} RETURNING *`;
  if (t) await notifyStatus(t, status);
  revalidatePath(`/tickets/${id}`);
  revalidatePath('/tickets');
}

export async function commentAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const body = String(formData.get('body') || '').trim();
  if (!body) return;
  const internal = formData.get('internal') === 'on';
  const author = String(formData.get('author') || 'Team').slice(0, 100);
  await sql`
    INSERT INTO comments (ticket_id, author, body, internal)
    VALUES (${id}, ${author}, ${body.slice(0, 10000)}, ${internal})`;
  await sql`UPDATE tickets SET updated_at = now() WHERE id = ${id}`;

  // Public replies are emailed to the customer (Resend). Their replies thread
  // back in via /api/inbound-email matching the [DTF-xxxx] ref in the subject.
  if (!internal) {
    const [t] = await sql`SELECT * FROM tickets WHERE id = ${id}`;
    if (t?.customer_email) {
      await sendCustomerEmail({
        to: t.customer_email,
        subject: `Re: [${ticketRef(t.id)}] ${t.subject}`,
        text:
          `${body}\n\n— ${author}, DTF Now Support\n` +
          `Reply to this email and it will be added to your support ticket ${ticketRef(t.id)}.`,
      });
    }
  }
  revalidatePath(`/tickets/${id}`);
}

export async function requestFilesAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const uploadUrl = String(formData.get('uploadUrl') || '');
  const author = String(formData.get('author') || 'Team').slice(0, 100);
  const [t] = await sql`SELECT * FROM tickets WHERE id = ${id}`;
  if (!t?.customer_email || !uploadUrl) return;

  const body =
    `Please send us your artwork using our secure upload page:\n${uploadUrl}\n\n` +
    `You'll need your order number${t.order_number ? ` (${t.order_number})` : ''} and the email you ordered with. ` +
    `Files up to 50 MB are fine, and you can attach several at once.`;

  await sql`
    INSERT INTO comments (ticket_id, author, body, internal)
    VALUES (${id}, ${author}, ${body}, false)`;
  await sql`UPDATE tickets SET status = 'waiting', updated_at = now() WHERE id = ${id}`;
  await sendCustomerEmail({
    to: t.customer_email,
    subject: `Re: [${ticketRef(t.id)}] ${t.subject}`,
    text: `${body}\n\n— ${author}, DTF Now Support`,
  });
  revalidatePath(`/tickets/${id}`);
}

export async function customerNoteAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const email = String(formData.get('email') || '').trim();
  const body = String(formData.get('body') || '').trim();
  if (!email || !body) return;
  await sql`
    INSERT INTO customer_notes (email, author, body)
    VALUES (${email}, ${String(formData.get('author') || 'Team').slice(0, 100)},
            ${body.slice(0, 10000)})`;
  revalidatePath(`/customers/${encodeURIComponent(email)}`);
}

export async function raiseReprintAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const [t] = await sql`SELECT * FROM tickets WHERE id = ${id}`;
  if (!t || t.reprint_id || !reprintConfigured()) return;

  const rows = await sql`SELECT shop FROM shop_tokens ORDER BY updated_at DESC LIMIT 1`;
  const shop =
    rows[0]?.shop ||
    `${(process.env.SHOPIFY_STORE || '').replace('.myshopify.com', '')}.myshopify.com`;

  const reason = t.category === 'print_quality' ? 'misprint' : 'other';
  const created = await createReprint({
    shop,
    orderName: t.order_number || '',
    reason,
    notes: `Raised from helpdesk ticket ${ticketRef(t.id)} — ${t.subject}\n${appUrl(`/tickets/${t.id}`)}`,
    raisedBy: String(formData.get('raisedBy') || 'Helpdesk').slice(0, 100),
    notify: formData.get('notify') === 'on',
    customerEmail: t.customer_email || undefined,
  });

  if (created) {
    await sql`UPDATE tickets SET reprint_id = ${created.id}, reprint_token = ${created.publicToken || ''}, updated_at = now() WHERE id = ${id}`;
    await sql`INSERT INTO comments (ticket_id, author, body, internal)
      VALUES (${id}, 'System', ${'Reprint raised in tracker' + (created.trackUrl ? ` — customer tracking: ${created.trackUrl}` : '')}, true)`;
    await notifySlack(
      `:repeat: Reprint raised from ticket *${ticketRef(id)}*${t.order_number ? ` (order ${t.order_number})` : ''}`
    );
  } else {
    await sql`INSERT INTO comments (ticket_id, author, body, internal)
      VALUES (${id}, 'System', 'Reprint creation FAILED — check REPRINT_APP_URL / REPRINT_API_KEY and tracker logs.', true)`;
  }
  revalidatePath(`/tickets/${id}`);
}
