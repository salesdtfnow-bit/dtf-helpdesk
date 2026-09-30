'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSql, ensureSchema, ticketRef } from '../lib/db';
import { createTicket } from '../lib/tickets';
import { notifyAssigned, notifyStatus, notifySlack, appUrl } from '../lib/slack';
import { sendCustomerEmail } from '../lib/email';
import { createReprint, reprintConfigured } from '../lib/reprint';
import { relayFilesToUploader, uploadsConfigured, uploadPageUrl } from '../lib/uploads';
import { sendWhatsAppText } from '../lib/whatsapp';
import { hashPassword, verifyPassword, requireAdmin, currentUser } from '../lib/auth';
import { makeStaffSession, STAFF_COOKIE } from '../lib/session';
import { logEvent, currentActor } from '../lib/events';

export async function createTicketAction(formData) {
  const order_number = String(formData.get('order_number') || '').trim();
  if (!order_number) redirect('/tickets/new?error=order');

  const t = await createTicket({
    subject: formData.get('subject'),
    description: formData.get('description'),
    category: formData.get('category'),
    priority: formData.get('priority'),
    channel: formData.get('channel') || 'manual',
    customer_name: formData.get('customer_name'),
    customer_email: formData.get('customer_email'),
    order_number,
    assignee: formData.get('assignee'),
  }, { actor: await currentActor() });

  const files = formData.getAll('files').filter((f) => typeof f !== 'string' && f && f.size > 0);
  if (files.length > 0) {
    const sql = getSql();
    if (!uploadsConfigured()) {
      await sql`INSERT INTO comments (ticket_id, author, body, internal)
        VALUES (${t.id}, 'System', ${'Staff attached ' + files.length + ' file(s) but UPLOAD_APP_URL is not configured — files were NOT stored.'}, true)`;
    } else {
      const result = await relayFilesToUploader({
        name: String(formData.get('customer_name') || ''),
        email: String(formData.get('customer_email') || ''),
        orderNumber: order_number,
        files,
      });
      const body = result.ok
        ? `Uploaded ${result.fileNames?.length || files.length} file(s) to Files Uploader (order ${result.orderName || order_number}): ${(result.fileNames || []).join(', ')} — saved to Google Drive.`
        : `Attached ${files.length} file(s) but the Files Uploader rejected them: ${result.error || 'unknown error'}.`;
      await sql`INSERT INTO comments (ticket_id, author, body, internal)
        VALUES (${t.id}, 'System', ${body.slice(0, 5000)}, ${!result.ok})`;
    }
  }

  redirect(`/tickets/${t.id}`);
}

export async function publicTicketAction(formData) {
  const order_number = String(formData.get('order_number') || '').trim();
  if (!order_number) redirect('/support?error=order');

  await createTicket({
    subject: formData.get('subject'),
    description: formData.get('description'),
    category: formData.get('category'),
    channel: 'form',
    customer_name: formData.get('customer_name'),
    customer_email: formData.get('customer_email'),
    order_number,
  });

  // Customer artwork never travels through the helpdesk — Vercel caps serverless request
  // bodies at ~4.5 MB. Send them to the Files Uploader instead (50 MB per file).
  redirect(formData.get('needs_files') === 'on' ? '/thanks?upload=1' : '/thanks');
}

export async function editTicketAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const subject = String(formData.get('subject') || '').trim().slice(0, 300);
  const description = String(formData.get('description') || '').slice(0, 10000);
  if (!id || !subject) return;
  const [before] = await sql`SELECT subject, description FROM tickets WHERE id = ${id}`;
  await sql`UPDATE tickets SET subject = ${subject}, description = ${description}, updated_at = now() WHERE id = ${id}`;
  if (before) {
    const norm = (v) => String(v || '').replace(/\r\n/g, '\n');
    const changed = [];
    if (before.subject !== subject) changed.push('subject');
    if (norm(before.description) !== norm(description)) changed.push('description');
    if (changed.length) await logEvent(id, await currentActor(), 'edited', '', changed.join(' and '));
  }
  revalidatePath(`/tickets/${id}`);
  revalidatePath('/tickets');
}

export async function deleteTicketAction(formData) {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  if (!id) return;
  await sql`DELETE FROM comments WHERE ticket_id = ${id}`;
  await sql`DELETE FROM tickets WHERE id = ${id}`;
  try {
    await sql`DELETE FROM ticket_events WHERE ticket_id = ${id}`;
  } catch (e) {
    console.error('ticket_events cleanup failed:', e.message);
  }
  revalidatePath('/tickets');
  redirect('/tickets');
}

// Shared status update (Status form + quick-action buttons): update, Slack notify, history.
async function applyStatus(sql, id, status, actor) {
  const allowed = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];
  if (!allowed.includes(status)) return;
  const [before] = await sql`SELECT status FROM tickets WHERE id = ${id}`;
  const [t] = await sql`
    UPDATE tickets SET status = ${status}, updated_at = now()
    WHERE id = ${id} RETURNING *`;
  if (t) await notifyStatus(t, status);
  if (t && before && before.status !== status) await logEvent(id, actor, 'status', before.status, status);
}

// Shared assignment (Assign form + "Start working"): update, Slack notify, history.
// Assigning someone to an Open ticket moves it to In progress.
async function applyAssign(sql, id, assignee, actor) {
  const [before] = await sql`SELECT assignee FROM tickets WHERE id = ${id}`;
  const [t] = await sql`
    UPDATE tickets SET assignee = ${assignee}, updated_at = now()
    WHERE id = ${id} RETURNING *`;
  if (t && assignee) await notifyAssigned(t, assignee);
  if (t && before && before.assignee !== assignee) await logEvent(id, actor, 'assign', before.assignee, assignee);
  if (t && assignee && t.status === 'open') await applyStatus(sql, id, 'in_progress', actor);
}

export async function assignAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const assignee = String(formData.get('assignee') || '');
  await applyAssign(sql, id, assignee, await currentActor());
  revalidatePath(`/tickets/${id}`);
  revalidatePath('/tickets');
}

export async function statusAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const status = String(formData.get('status'));
  await applyStatus(sql, id, status, await currentActor());
  revalidatePath(`/tickets/${id}`);
  revalidatePath('/tickets');
}

// "Start working": take an unassigned ticket and move it to In progress.
export async function startWorkingAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  if (!id) return;
  const me = await currentUser().catch(() => null);
  const actor = me?.name || 'System';
  const [t] = await sql`SELECT status, assignee FROM tickets WHERE id = ${id}`;
  if (!t) return;
  if (!t.assignee && me?.source === 'staff' && me.name) await applyAssign(sql, id, me.name, actor);
  const [now] = await sql`SELECT status FROM tickets WHERE id = ${id}`;
  if (now && now.status !== 'in_progress') await applyStatus(sql, id, 'in_progress', actor);
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
  await logEvent(id, await currentActor(author), internal ? 'note' : 'reply');

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
    await logEvent(id, await currentActor(String(formData.get('raisedBy') || 'Helpdesk')), 'reprint', '', created.id);
  } else {
    await sql`INSERT INTO comments (ticket_id, author, body, internal)
      VALUES (${id}, 'System', 'Reprint creation FAILED — check REPRINT_APP_URL / REPRINT_API_KEY and tracker logs.', true)`;
    await logEvent(id, await currentActor(String(formData.get('raisedBy') || 'Helpdesk')), 'reprint_failed');
  }
  revalidatePath(`/tickets/${id}`);
}

export async function requestFilesAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const author = String(formData.get('author') || 'Team').slice(0, 100);
  if (!id) return;
  const [t] = await sql`SELECT * FROM tickets WHERE id = ${id}`;
  if (!t?.customer_email) return;

  const body =
    `Please send us your artwork using our secure upload page: ${uploadPageUrl()}\n\n` +
    `You'll need your order number${t.order_number ? ` (${t.order_number})` : ''} and the email ` +
    `address you ordered with. Files can be up to 50 MB each — please don't email them to us, ` +
    `the upload page files them against your order automatically.`;

  await sql`
    INSERT INTO comments (ticket_id, author, body, internal)
    VALUES (${id}, ${author}, ${body.slice(0, 10000)}, false)`;
  await sql`UPDATE tickets SET status = 'waiting', updated_at = now() WHERE id = ${id}`;
  const actor = await currentActor(author);
  await logEvent(id, actor, 'upload_link');
  if (t.status !== 'waiting') await logEvent(id, actor, 'status', t.status, 'waiting');

  await sendCustomerEmail({
    to: t.customer_email,
    subject: `Re: [${ticketRef(t.id)}] ${t.subject}`,
    text:
      `${body}\n\n— ${author}, DTF Now Support\n` +
      `Reply to this email and it will be added to your support ticket ${ticketRef(t.id)}.`,
  });
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
  await sql`UPDATE wa_conversations SET assignee = ${assignee} WHERE id = ${conversationId}`;
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

export async function deleteWaMessageAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  if (!id) return;
  const [m] = await sql`SELECT conversation_id FROM wa_messages WHERE id = ${id}`;
  if (m) {
    await sql`DELETE FROM wa_messages WHERE id = ${id}`;
    revalidatePath(`/whatsapp/${m.conversation_id}`);
  }
}

export async function editWaMessageAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const body = String(formData.get('body') || '').trim();
  if (!id || !body) return;
  const [m] = await sql`UPDATE wa_messages SET body = ${body.slice(0, 4096)}, edited = true WHERE id = ${id} RETURNING conversation_id`;
  if (m) revalidatePath(`/whatsapp/${m.conversation_id}`);
}

export async function deleteWaConversationAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const conversationId = Number(formData.get('conversation_id'));
  if (conversationId) await sql`DELETE FROM wa_conversations WHERE id = ${conversationId}`;
  revalidatePath('/whatsapp');
  redirect('/whatsapp');
}

export async function createTicketFromWaAction(formData) {
  await ensureSchema();
  const sql = getSql();
  const conversationId = Number(formData.get('conversation_id'));
  const [conv] = await sql`SELECT * FROM wa_conversations WHERE id = ${conversationId}`;
  if (!conv) return;
  const [firstMsg] = await sql`
    SELECT body FROM wa_messages WHERE conversation_id = ${conversationId} AND direction = 'in'
    ORDER BY created_at ASC LIMIT 1`;
  const t = await createTicket({
    subject: `WhatsApp chat with ${conv.name || '+' + conv.wa_id}`,
    description: firstMsg?.body || '',
    channel: 'whatsapp',
    category: 'other',
    customer_name: conv.name || '',
    assignee: conv.assignee || '',
  }, { actor: await currentActor() });
  await sql`UPDATE tickets SET wa_conversation_id = ${conversationId} WHERE id = ${t.id}`;
  redirect(`/tickets/${t.id}`);
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

// Staff sign in with their name or Slack member ID (a personal email still works for
// legacy rows that have one). If the identifier matches more than one active member we
// refuse rather than guess.
export async function loginAction(formData) {
  const login = String(formData.get('login') ?? formData.get('email') ?? '').trim();
  const password = String(formData.get('password') || '');
  const nextRaw = String(formData.get('next') || '/tickets');
  const next = nextRaw.startsWith('/') ? nextRaw : '/tickets';
  if (!login) redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  await ensureSchema();
  const sql = getSql();
  const lower = login.toLowerCase();
  const upper = login.toUpperCase();
  const matches = await sql`
    SELECT * FROM staff
    WHERE active = true
      AND (lower(trim(name)) = ${lower}
        OR (slack_id <> '' AND upper(trim(slack_id)) = ${upper})
        OR lower(email) = ${lower})
    LIMIT 2`;
  if (matches.length > 1) redirect(`/login?error=ambiguous&next=${encodeURIComponent(next)}`);
  const s = matches[0];
  if (!s || !s.password_hash || !verifyPassword(password, s.password_hash)) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  const value = await makeStaffSession({ id: s.id, email: s.email || null, name: s.name, role: s.role });
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

// Redirect back to /admin with a visible notice (?ok= or ?error=).
function adminNotice(kind, message) {
  redirect(`/admin?${new URLSearchParams({ [kind]: message }).toString()}`);
}

function duplicateEmailMessage(email) {
  return `A staff member with email ${email} already exists — edit their row instead`;
}

const SLACK_ID_RE = /^[UW][A-Z0-9]{6,}$/;

// Read + validate the staff identity fields shared by the add and edit forms.
// Empty email is stored as NULL (never ''), so several email-less staff can coexist.
function readStaffFields(formData) {
  const name = String(formData.get('name') || '').trim().slice(0, 100);
  const slack_id = String(formData.get('slack_id') || '').trim().toUpperCase().slice(0, 50);
  const email = String(formData.get('email') || '').trim().toLowerCase().slice(0, 200) || null;
  if (!name) adminNotice('error', 'Name is required.');
  if (!slack_id) adminNotice('error', 'Slack member ID is required.');
  if (!SLACK_ID_RE.test(slack_id)) {
    adminNotice('error', `"${slack_id}" doesn't look like a Slack member ID (e.g. U0XXXXXXXXX).`);
  }
  return { name, slack_id, email };
}

// Name, Slack ID and (if given) email must each be unique across all staff rows
// (active or not). excludeId skips the row being edited.
async function staffClashMessage(sql, { name, slack_id, email }, excludeId = 0) {
  const [byName] = await sql`
    SELECT id FROM staff WHERE lower(trim(name)) = ${name.toLowerCase()} AND id <> ${excludeId} LIMIT 1`;
  if (byName) return `A staff member named ${name} already exists — edit their row instead`;
  const [bySlack] = await sql`
    SELECT name FROM staff WHERE upper(trim(slack_id)) = ${slack_id} AND id <> ${excludeId} LIMIT 1`;
  if (bySlack) return `Slack member ID ${slack_id} is already used by ${bySlack.name}`;
  if (email) {
    const [byEmail] = await sql`
      SELECT id FROM staff WHERE lower(email) = ${email} AND id <> ${excludeId} LIMIT 1`;
    if (byEmail) return duplicateEmailMessage(email);
  }
  return '';
}

// Active admins other than the given staff id (lockout protection).
async function otherActiveAdmins(sql, id) {
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM staff WHERE role = 'admin' AND active = true AND id <> ${id}`;
  return count;
}

async function isLastActiveAdmin(sql, id) {
  const [target] = await sql`SELECT role, active FROM staff WHERE id = ${id}`;
  return !!target && target.role === 'admin' && target.active && (await otherActiveAdmins(sql, id)) === 0;
}

export async function addStaffAction(formData) {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();
  const { name, slack_id, email } = readStaffFields(formData);
  const role = String(formData.get('role') || 'agent') === 'admin' ? 'admin' : 'agent';
  const password = String(formData.get('password') || '');
  if (!password) adminNotice('error', 'A password is required for new staff.');
  // Plain insert: never touch an existing member (autofilled emails used to overwrite rows).
  const clash = await staffClashMessage(sql, { name, slack_id, email });
  if (clash) adminNotice('error', clash);
  const password_hash = hashPassword(password);
  let duplicate = false;
  try {
    await sql`
      INSERT INTO staff (name, email, role, slack_id, password_hash)
      VALUES (${name}, ${email}, ${role}, ${slack_id}, ${password_hash})`;
  } catch (e) {
    if (e.code !== '23505') throw e;
    duplicate = true;
  }
  if (duplicate) {
    adminNotice('error', email ? duplicateEmailMessage(email) : 'That staff member already exists — edit their row instead');
  }
  revalidatePath('/admin');
  adminNotice('ok', `Added ${name}`);
}

export async function updateStaffAction(formData) {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();
  const id = Number(formData.get('id'));
  if (!id) adminNotice('error', 'Staff member not found.');
  const { name, slack_id, email } = readStaffFields(formData);
  const clash = await staffClashMessage(sql, { name, slack_id, email }, id);
  if (clash) adminNotice('error', clash);
  let duplicate = false;
  let updated = null;
  try {
    const rows = await sql`
      UPDATE staff SET name = ${name}, email = ${email}, slack_id = ${slack_id}
      WHERE id = ${id} RETURNING id`;
    updated = rows[0] || null;
  } catch (e) {
    if (e.code !== '23505') throw e;
    duplicate = true;
  }
  if (duplicate) {
    adminNotice('error', email ? duplicateEmailMessage(email) : 'That staff member already exists — edit their row instead');
  }
  if (!updated) adminNotice('error', 'Staff member not found.');
  revalidatePath('/admin');
  adminNotice('ok', `Updated ${name}`);
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
  if (id && !active && (await isLastActiveAdmin(sql, id))) {
    adminNotice('error', "Can't deactivate the last active admin — make someone else an admin first.");
  }
  if (id) await sql`UPDATE staff SET active = ${active} WHERE id = ${id}`;
  revalidatePath('/admin');
}

export async function setStaffRoleAction(formData) {
  await requireAdmin();
  const sql = getSql();
  const id = Number(formData.get('id'));
  const role = String(formData.get('role')) === 'admin' ? 'admin' : 'agent';
  if (id && role !== 'admin' && (await isLastActiveAdmin(sql, id))) {
    adminNotice('error', "Can't demote the last active admin — make someone else an admin first.");
  }
  if (id) await sql`UPDATE staff SET role = ${role} WHERE id = ${id}`;
  revalidatePath('/admin');
}

export async function deleteStaffAction(formData) {
  const me = await requireAdmin();
  const sql = getSql();
  const id = Number(formData.get('id'));
  if (id && id === me.id) adminNotice('error', "You can't remove yourself.");
  if (id && (await isLastActiveAdmin(sql, id))) {
    adminNotice('error', "Can't remove the last active admin — make someone else an admin first.");
  }
  if (id && id !== me.id) await sql`DELETE FROM staff WHERE id = ${id}`;
  revalidatePath('/admin');
}
