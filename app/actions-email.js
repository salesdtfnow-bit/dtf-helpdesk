'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSql, ensureSchema } from '../lib/db';
import { sendCustomerEmail } from '../lib/email';
import { createTicket } from '../lib/tickets';
import { notifySlack, appUrl } from '../lib/slack';

export async function sendEmailReplyAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const conversationId = Number(formData.get('conversation_id'));
  const body = String(formData.get('body') || '').trim();
  const author = String(formData.get('author') || 'Team').slice(0, 100);
  if (!conversationId || !body) return;
  const [conv] = await sql`SELECT * FROM email_conversations WHERE id = ${conversationId}`;
  if (!conv) return;
  const [last] = await sql`
    SELECT subject FROM email_messages WHERE conversation_id = ${conversationId} AND subject <> ''
    ORDER BY created_at DESC LIMIT 1`;
  const base = last?.subject || 'your message to DTF Now';
  const subject = /^re:/i.test(base) ? base : `Re: ${base}`;
  const ok = await sendCustomerEmail({
    to: conv.email,
    subject,
    text: `${body}\n\n— ${author}, DTF Now Support`,
  });
  await sql`INSERT INTO email_messages (conversation_id, direction, subject, body, author)
    VALUES (${conversationId}, 'out', ${subject.slice(0, 300)}, ${body.slice(0, 20000)}, ${author})`;
  await sql`UPDATE email_conversations SET last_message_at = now(), unread = 0 WHERE id = ${conversationId}`;
  if (!ok) await notifySlack(`:warning: Email reply to ${conv.email} failed to send (check RESEND_API_KEY / domain).`);
  revalidatePath(`/email/${conversationId}`);
  revalidatePath('/email');
}

export async function assignEmailAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const conversationId = Number(formData.get('conversation_id'));
  const assignee = String(formData.get('assignee') || '');
  const [conv] = await sql`
    UPDATE email_conversations SET assignee = ${assignee} WHERE id = ${conversationId} RETURNING *`;
  if (conv && assignee) {
    const link = appUrl(`/email/${conversationId}`);
    await notifySlack(
      `:email: Email thread with ${conv.name || conv.email} assigned to *${assignee}*` +
        (link ? `\n<${link}|Open email>` : '')
    );
  }
  revalidatePath(`/email/${conversationId}`);
  revalidatePath('/email');
}

export async function emailStatusAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const conversationId = Number(formData.get('conversation_id'));
  const status = String(formData.get('status') || 'open');
  if (!['open', 'closed'].includes(status)) return;
  await sql`UPDATE email_conversations SET status = ${status} WHERE id = ${conversationId}`;
  revalidatePath(`/email/${conversationId}`);
  revalidatePath('/email');
}

export async function deleteEmailMessageAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  if (!id) return;
  const [m] = await sql`SELECT conversation_id FROM email_messages WHERE id = ${id}`;
  if (m) {
    await sql`DELETE FROM email_messages WHERE id = ${id}`;
    revalidatePath(`/email/${m.conversation_id}`);
  }
}

export async function editEmailMessageAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const body = String(formData.get('body') || '').trim();
  if (!id || !body) return;
  const [m] = await sql`UPDATE email_messages SET body = ${body.slice(0, 20000)}, edited = true WHERE id = ${id} RETURNING conversation_id`;
  if (m) revalidatePath(`/email/${m.conversation_id}`);
}

export async function deleteEmailConversationAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const conversationId = Number(formData.get('conversation_id'));
  if (conversationId) await sql`DELETE FROM email_conversations WHERE id = ${conversationId}`;
  revalidatePath('/email');
  redirect('/email');
}

export async function createTicketFromEmailAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const conversationId = Number(formData.get('conversation_id'));
  const [conv] = await sql`SELECT * FROM email_conversations WHERE id = ${conversationId}`;
  if (!conv) return;
  const [firstMsg] = await sql`
    SELECT subject, body FROM email_messages WHERE conversation_id = ${conversationId} AND direction = 'in'
    ORDER BY created_at ASC LIMIT 1`;
  const t = await createTicket({
    subject: firstMsg?.subject || `Email from ${conv.name || conv.email}`,
    description: firstMsg?.body || '',
    channel: 'email',
    category: 'other',
    customer_name: conv.name || '',
    customer_email: conv.email,
    assignee: conv.assignee || '',
  });
  redirect(`/tickets/${t.id}`);
}
