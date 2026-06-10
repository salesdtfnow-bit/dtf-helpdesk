'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSql, ensureSchema } from '../lib/db';
import { createTicket } from '../lib/tickets';
import { notifyAssigned, notifyStatus } from '../lib/slack';

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
  await createTicket({
    subject: formData.get('subject'),
    description: formData.get('description'),
    category: formData.get('category'),
    channel: 'form',
    customer_name: formData.get('customer_name'),
    customer_email: formData.get('customer_email'),
    order_number: formData.get('order_number'),
  });
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
  await sql`
    INSERT INTO comments (ticket_id, author, body, internal)
    VALUES (${id}, ${String(formData.get('author') || 'Team').slice(0, 100)},
            ${body.slice(0, 10000)}, ${formData.get('internal') === 'on'})`;
  await sql`UPDATE tickets SET updated_at = now() WHERE id = ${id}`;
  revalidatePath(`/tickets/${id}`);
}
