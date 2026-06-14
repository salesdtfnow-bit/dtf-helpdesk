import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSql, ensureSchema, hasDb } from '../../../lib/db';
import { getAgents } from '../../../lib/auth';
import {
  sendEmailReplyAction,
  assignEmailAction,
  emailStatusAction,
  deleteEmailMessageAction,
  editEmailMessageAction,
  deleteEmailConversationAction,
  createTicketFromEmailAction,
} from '../../actions-email';
import EmailSync from '../EmailSync';
import MessageActions from '../../whatsapp/MessageActions';

export const dynamic = 'force-dynamic';

export default async function EmailThreadPage({ params }) {
  if (!hasDb()) notFound();
  await ensureSchema();
  const sql = getSql();
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();
  const [conv] = await sql`SELECT * FROM email_conversations WHERE id = ${id}`;
  if (!conv) notFound();
  const messages = await sql`SELECT * FROM email_messages WHERE conversation_id = ${id} ORDER BY created_at ASC`;
  await sql`UPDATE email_conversations SET unread = 0 WHERE id = ${id}`;
  const agentList = await getAgents();

  return (
    <>
      <EmailSync seconds={20} />
      <p className="muted">
        <Link className="row-link" href="/email">
          ← All emails
        </Link>
      </p>
      <h1>{conv.name || conv.email}</h1>
      <p className="muted">
        {conv.email}
        {conv.assignee ? ` · assigned to ${conv.assignee}` : ' · unassigned'} ·{' '}
        <span className={`badge ${conv.status === 'closed' ? 'closed' : 'open'}`}>{conv.status}</span>
      </p>

      <div className="grid">
        <div className="card">
          <div className="wa-thread">
            {messages.length === 0 && <p className="muted">No messages yet.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`wa-msg ${m.direction === 'out' ? 'wa-out' : 'wa-in'}`}>
                {m.subject ? <div style={{ fontWeight: 600, marginBottom: 4 }}>{m.subject}</div> : null}
                {m.body}
                <span className="meta">
                  {m.direction === 'out' ? m.author || 'Team' : conv.name || conv.email} ·{' '}
                  {new Date(m.created_at).toLocaleString('en-GB')}
                  {m.edited ? ' · edited' : ''}
                </span>
                <MessageActions
                  id={m.id}
                  body={m.body}
                  editAction={editEmailMessageAction}
                  deleteAction={deleteEmailMessageAction}
                />
              </div>
            ))}
          </div>

          <form action={sendEmailReplyAction} className="stack" style={{ marginTop: 12 }}>
            <input type="hidden" name="conversation_id" value={conv.id} />
            <textarea name="body" required placeholder="Write a reply…" />
            <div className="inline-form">
              <select name="author" defaultValue={agentList[0]}>
                {agentList.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <button type="submit">Send reply</button>
            </div>
          </form>
        </div>

        <div>
          <div className="card">
            <h2>Assign</h2>
            <form action={assignEmailAction} className="inline-form">
              <input type="hidden" name="conversation_id" value={conv.id} />
              <select name="assignee" defaultValue={conv.assignee}>
                <option value="">Unassigned</option>
                {agentList.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <button type="submit" className="secondary">Assign</button>
            </form>
          </div>
          <div className="card">
            <h2>Status</h2>
            <form action={emailStatusAction} className="inline-form">
              <input type="hidden" name="conversation_id" value={conv.id} />
              <select name="status" defaultValue={conv.status}>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
              <button type="submit" className="secondary">Update</button>
            </form>
          </div>
          <div className="card">
            <h2>Actions</h2>
            <form action={createTicketFromEmailAction} style={{ marginBottom: 10 }}>
              <input type="hidden" name="conversation_id" value={conv.id} />
              <button type="submit">Create ticket from email</button>
            </form>
            <form action={deleteEmailConversationAction}>
              <input type="hidden" name="conversation_id" value={conv.id} />
              <button type="submit" className="secondary">Delete thread</button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
