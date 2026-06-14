import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSql, ensureSchema, hasDb } from '../../../lib/db';
import { getAgents } from '../../../lib/auth';
import { whatsappConfigured } from '../../../lib/whatsapp';
import {
  sendWaAction,
  assignWaAction,
  waStatusAction,
  deleteWaMessageAction,
  editWaMessageAction,
  deleteWaConversationAction,
  createTicketFromWaAction,
} from '../../actions';
import AutoRefresh from '../AutoRefresh';
import MessageActions from '../MessageActions';

export const dynamic = 'force-dynamic';

export default async function WaChatPage({ params }) {
  if (!hasDb()) notFound();
  await ensureSchema();
  const sql = getSql();
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();
  const [conv] = await sql`SELECT * FROM wa_conversations WHERE id = ${id}`;
  if (!conv) notFound();
  const messages = await sql`SELECT * FROM wa_messages WHERE conversation_id = ${id} ORDER BY created_at ASC`;
  await sql`UPDATE wa_conversations SET unread = 0 WHERE id = ${id}`;
  const agentList = await getAgents();

  const lastInbound = conv.last_inbound_at ? new Date(conv.last_inbound_at) : null;
  const within24h = lastInbound && Date.now() - lastInbound.getTime() < 24 * 60 * 60 * 1000;

  return (
    <>
      <AutoRefresh seconds={8} />
      <p className="muted">
        <Link className="row-link" href="/whatsapp">
          ← All chats
        </Link>
      </p>
      <h1>{conv.name || `+${conv.wa_id}`}</h1>
      <p className="muted">
        +{conv.wa_id}
        {conv.assignee ? ` · assigned to ${conv.assignee}` : ' · unassigned'} ·{' '}
        <span className={`badge ${conv.status === 'closed' ? 'closed' : 'open'}`}>{conv.status}</span>
      </p>

      <div className="grid">
        <div className="card">
          <div className="wa-thread">
            {messages.length === 0 && <p className="muted">No messages yet.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`wa-msg ${m.direction === 'out' ? 'wa-out' : 'wa-in'}`}>
                {m.body}
                <span className="meta">
                  {m.direction === 'out' ? m.author || 'Team' : conv.name || 'Customer'} ·{' '}
                  {new Date(m.created_at).toLocaleString('en-GB')}
                  {m.edited ? ' · edited' : ''}
                  {m.direction === 'out' && m.status ? ` · ${m.status}` : ''}
                </span>
                <MessageActions
                  id={m.id}
                  body={m.body}
                  editAction={editWaMessageAction}
                  deleteAction={deleteWaMessageAction}
                />
              </div>
            ))}
          </div>

          {!whatsappConfigured() && (
            <p className="notice" style={{ marginTop: 12 }}>
              WhatsApp not connected — set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID to send.
            </p>
          )}
          {whatsappConfigured() && !within24h && (
            <p className="notice" style={{ marginTop: 12 }}>
              Outside the 24-hour customer service window — a free-form message may not deliver.
              WhatsApp requires an approved template to re-open the conversation.
            </p>
          )}

          <form action={sendWaAction} className="stack" style={{ marginTop: 12 }}>
            <input type="hidden" name="conversation_id" value={conv.id} />
            <textarea name="body" required placeholder="Type a message…" />
            <div className="inline-form">
              <select name="author" defaultValue={agentList[0]}>
                {agentList.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <button type="submit">Send</button>
            </div>
          </form>
        </div>

        <div>
          <div className="card">
            <h2>Assign</h2>
            <form action={assignWaAction} className="inline-form">
              <input type="hidden" name="conversation_id" value={conv.id} />
              <select name="assignee" defaultValue={conv.assignee}>
                <option value="">Unassigned</option>
                {agentList.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <button type="submit" className="secondary">
                Assign
              </button>
            </form>
          </div>
          <div className="card">
            <h2>Status</h2>
            <form action={waStatusAction} className="inline-form">
              <input type="hidden" name="conversation_id" value={conv.id} />
              <select name="status" defaultValue={conv.status}>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
              <button type="submit" className="secondary">
                Update
              </button>
            </form>
          </div>
          <div className="card">
            <h2>Actions</h2>
            <form action={createTicketFromWaAction} style={{ marginBottom: 10 }}>
              <input type="hidden" name="conversation_id" value={conv.id} />
              <button type="submit">Create ticket from chat</button>
            </form>
            <form action={deleteWaConversationAction}>
              <input type="hidden" name="conversation_id" value={conv.id} />
              <button type="submit" className="secondary">Delete chat</button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
