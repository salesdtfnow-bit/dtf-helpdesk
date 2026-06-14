'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSql, ensureSchema, ticketRef } from '../lib/db';
import { createTicket } from '../lib/tickets';
import { notifyAssigned, notifyStatus, notifySlack, appUrl } from '../lib/slack';
import { sendCustomerEmail } from '../lib/email';
import { createReprint, reprintConfigured } from '../lib/reprint';
import { relayFilesToUploader, uploadsConfigured } from '../lib/uploads';
import { sendWhatsAppText } from '../lib/whatsapp';
import { hashPassword, verifyPassword, requireAdmin } from '../lib/auth';
import { makeStaffSession, STAFF_COOKIE } from '../lib/session';

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
  const t = await createTicket({
    subject: formData.get('subject'),
    description: formData.get('description'),
    category: formData.get('category'),
    channel: 'form',
    customer_name: formData.get('customer_name'),
    customer_email: formData.get('customer_email'),
    order_number: formData.get('order_number'),
  });

  const files = formData.getAll('files').filter((f) => typeof f !== 'string' && f && f.size > 0);
  if (files.length > 0) {
    const sql = getSql();
    if (!uploadsConfigured()) {
      await sql`INSERT INTO comments (ticket_id, author, body, internal)
        VALUES (${t.id}, 'System', ${'Customer attached ' + files.length + ' file(s) but UPLOAD_APP_URL is not configured — files were NOT stored.'}, true)`;
    } else {
      const result = await relayFilesToUploader({
        name: String(formData.get('customer_name') || ''),
        email: String(formData.get('customer_email') || ''),
        orderNumber: String(formData.get('order_number') || ''),
        files,
      });
      const body = result.ok
        ? `Customer uploaded ${result.fileNames?.length || files.length} file(s) via Files Uploader (order ${result.orderName || formData.get('order_number')}): ${(result.fileNames || []).join(', ')} — saved to Google Drive, order tagged files-uploaded.`
        : `Customer attached ${files.length} file(s) but the Files Uploader rejected them: ${result.error || 'unknown error'}. Ask the customer to use the upload page directly.`;
      await sql`INSERT INTO comments (ticket_id, author, body, internal)
        VALUES (${t.id}, 'System', ${body.slice(0, 5000)}, ${!result.ok})`;
    }
  }
  redirect('/thanks');
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
  const shop = rows[0]?.shop || `${(process.env.SHOPIFY_STORE || '').replace('.myshopify.com', '')}.myshopify.com`;

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
    await notifySlack(`:repeat: Reprint raised from ticket *${ticketRef(id)}*${t.order_number ? ` (order ${t.order_number})` : ''}`);
  } else {
    await sql`INSERT INTO comments (ticket_id, author, body, internal)
      VALUES (${id}, 'System', 'Reprint creation FAILED — check REPRINT_APP_URL / REPRINT_API_KEY and tracker logs.', true)`;
  }
  revalidatePath(`/tickets/${id}`);
}

// ---- WhatsApp live chat ----

export async function sendWaAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const conversationId = Number(formData.get('conversation_id'));
  const body = String(formData.get('body') || '').trim();
  const author = String(formData.get('author') || 'Team').slice(0, 100);
  if (!conversationId || !body) return;
  const [conv] = await sql`SELECT * FROM wa_conversations WHERE id = ${conversationId}`;
  if (!conv) return;
  const result = await sendWhatsAppText(conv.wa_id, body);
  const status = result.ok ? 'sent' : `failed: ${(result.error || '').slice(0, 200)}`;
  await sql`INSERT INTO wa_messages (conversation_id, wa_message_id, direction, body, status, author)
    VALUES (${conversationId}, ${result.id || ''}, 'out', ${body.slice(0, 4096)}, ${status}, ${author})`;
  await sql`UPDATE wa_conversations SET last_message_at = now(), unread = 0 WHERE id = ${conversationId}`;
  revalidatePath(`/whatsapp/${conversationId}`);
  revalidatePath('/whatsapp');
}

export async function assignWaAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const conversationId = Number(formData.get('conversation_id'));
  const assignee = String(formData.get('assignee') || '');
  const [conv] = await sql`
    UPDATE wa_conversations SET assignee = ${assignee} WHERE id = ${conversationId} RETURNING *`;
  if (conv && assignee) {
    const link = appUrl(`/whatsapp/${conversationId}`);
    await notifySlack(
      `:speech_balloon: WhatsApp chat with ${conv.name || conv.wa_id} assigned to *${assignee}*` +
        (link ? `\n<${link}|Open chat>` : '')
    );
  }
  revalidatePath(`/whatsapp/${conversationId}`);
  revalidatePath('/whatsapp');
}

export async function waStatusAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const conversationId = Number(formData.get('conversation_id'));
  const status = String(formData.get('status') || 'open');
  if (!['open', 'closed'].includes(status)) return;
  await sql`UPDATE wa_conversations SET status = ${status} WHERE id = ${conversationId}`;
  revalidatePath(`/whatsapp/${conversationId}`);
  revalidatePath('/whatsapp');
}

// ---- Canned replies ----

export async function addCannedAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const title = String(formData.get('title') || '').trim().slice(0, 200);
  const body = String(formData.get('body') || '').trim().slice(0, 5000);
  if (!title || !body) return;
  await sql`INSERT INTO canned_replies (title, body) VALUES (${title}, ${body})`;
  revalidatePath('/canned');
}

export async function deleteCannedAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  if (id) await sql`DELETE FROM canned_replies WHERE id = ${id}`;
  revalidatePath('/canned');
}

// ---- Auth ----

export async function loginAction(formData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const nextRaw = String(formData.get('next') || '/tickets');
  const next = nextRaw.startsWith('/') ? nextRaw : '/tickets';
  await ensureSchema();
  const sql = getSql();
  const [s] = await sql`SELECT * FROM staff WHERE lower(email) = ${email} AND active = true`;
  if (!s || !s.password_hash || !verifyPassword(password, s.password_hash)) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  const value = await makeStaffSession({ id: s.id, email: s.email, name: s.name, role: s.role });
  cookies().set(STAFF_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  redirect(next);
}

// ---- Staff management (admin only) ----

export async function addStaffAction(formData) {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();
  const name = String(formData.get('name') || '').trim().slice(0, 100);
  const email = String(formData.get('email') || '').trim().toLowerCase().slice(0, 200);
  const role = String(formData.get('role') || 'agent') === 'admin' ? 'admin' : 'agent';
  const slack_id = String(formData.get('slack_id') || '').trim().slice(0, 50);
  const password = String(formData.get('password') || '');
  if (!name || !email) return;
  const password_hash = password ? hashPassword(password) : '';
  await sql`
    INSERT INTO staff (name, email, role, slack_id, password_hash)
    VALUES (${name}, ${email}, ${role}, ${slack_id}, ${password_hash})
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name, role = EXCLUDED.role, slack_id = EXCLUDED.slack_id, active = true`;
  revalidatePath('/admin');
}

export async function setStaffPasswordAction(formData) {
  await requireAdmin();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const password = String(formData.get('password') || '');
  if (!id || !password) return;
  await sql`UPDATE staff SET password_hash = ${hashPassword(password)} WHERE id = ${id}`;
  revalidatePath('/admin');
}

export async function setStaffActiveAction(formData) {
  await requireAdmin();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const active = String(formData.get('active')) === 'true';
  if (id) await sql`UPDATE staff SET active = ${active} WHERE id = ${id}`;
  revalidatePath('/admin');
}

export async function setStaffRoleAction(formData) {
  await requireAdmin();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const role = String(formData.get('role')) === 'admin' ? 'admin' : 'agent';
  if (id) await sql`UPDATE staff SET role = ${role} WHERE id = ${id}`;
  revalidatePath('/admin');
}

export async function deleteStaffAction(formData) {
  const me = await requireAdmin();
  const sql = getSql();
  const id = Number(formData.get('id'));
  if (id && id !== me.id) await sql`DELETE FROM staff WHERE id = ${id}`;
  revalidatePath('/admin');
}
