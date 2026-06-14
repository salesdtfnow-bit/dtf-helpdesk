import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSql, ensureSchema, hasDb, ticketRef, LABELS, STATUSES } from '../../../lib/db';
import { getAgents } from '../../../lib/auth';
import { recentOrdersByEmail, shopifyConfigured } from '../../../lib/shopify';
import { reprintConfigured, getReprint, reprintTrackUrl } from '../../../lib/reprint';
import {
  assignAction,
  statusAction,
  commentAction,
  raiseReprintAction,
  editTicketAction,
  sendWaAction,
} from '../../actions';
import { emailFromTicketAction } from '../../actions-email';
import CannedPicker from './CannedPicker';

export const dynamic = 'force-dynamic';

const PROGRESS_LABELS = {
  received: 'Received',
  reprinting: 'Reprinting',
  packed: 'Packed',
  dispatched: 'Dispatched',
};

export default async function TicketPage({ params }) {
  if (!hasDb()) notFound();
  await ensureSchema();
  const sql = getSql();
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();

  const [ticket] = await sql`SELECT * FROM tickets WHERE id = ${id}`;
  if (!ticket) notFound();
  const comments = await sql`SELECT * FROM comments WHERE ticket_id = ${id} ORDER BY created_at ASC`;
  const canned = await sql`SELECT id, title, body FROM canned_replies ORDER BY title ASC`;
  const agentList = await getAgents();
  const shopifyOn = await shopifyConfigured();
  const orders = await recentOrdersByEmail(ticket.customer_email);
  const reprint = ticket.reprint_id ? await getReprint(ticket.reprint_id) : null;

  const [waConv] = ticket.wa_conversation_id
    ? await sql`SELECT * FROM wa_conversations WHERE id = ${ticket.wa_conversation_id}`
    : [];
  const waMessages = waConv
    ? await sql`SELECT * FROM wa_messages WHERE conversation_id = ${waConv.id} ORDER BY created_at ASC`
    : [];

  const [emailConv] = ticket.customer_email
    ? await sql`SELECT * FROM email_conversations WHERE lower(email) = ${ticket.customer_email.toLowerCase()}`
    : [];
  const emailMessages = emailConv
    ? await sql`SELECT * FROM email_messages WHERE conversation_id = ${emailConv.id} ORDER BY created_at ASC`
    : [];
  const emailAtt = emailConv
    ? await sql`SELECT id, email_message_id, filename FROM email_attachments WHERE conversation_id = ${emailConv.id}`
    : [];
  const attByMsg = {};
  for (const a of emailAtt) (attByMsg[a.email_message_id] ||= []).push(a);

  return (
    <>
      <h1>
        {ticketRef(ticket.id)} — {ticket.subject}
      </h1>
      <p className="muted">
        {LABELS[ticket.category]} · via {LABELS[ticket.channel]} · created{' '}
        {new Date(ticket.created_at).toLocaleString('en-GB')}
      </p>

      <div className="grid">
        <div>
          <div className="card">
            <h2>Ticket</h2>
            <form action={editTicketAction} className="stack">
              <input type="hidden" name="id" value={ticket.id} />
              <div>
                <label>Subject</label>
                <input name="subject" defaultValue={ticket.subject} required />
              </div>
              <div>
                <label>Description</label>
                <textarea name="description" defaultValue={ticket.description} />
              </div>
              <button type="submit" className="secondary">Save</button>
            </form>
          </div>

          <div className="card">
            <h2>Notes &amp; replies</h2>
            <p className="muted">
              A reply (not an internal note) is emailed to the customer. Internal notes stay private.
            </p>
            {comments.length === 0 && <p className="muted">Nothing yet.</p>}
            {comments.map((c) => (
              <div key={c.id} className={`comment${c.internal ? ' internal' : ''}`}>
                <div className="meta">
                  <strong>{c.author}</strong> · {new Date(c.created_at).toLocaleString('en-GB')}
                  {c.internal ? ' · internal note' : ''}
                </div>
                <div className="desc">{c.body}</div>
              </div>
            ))}
            <form action={commentAction} className="stack" style={{ marginTop: 16 }}>
              <input type="hidden" name="id" value={ticket.id} />
              <div>
                <label>Reply / note</label>
                <div className="inline-form" style={{ marginBottom: 8 }}>
                  <CannedPicker replies={canned} targetId="reply-body" />
                </div>
                <textarea id="reply-body" name="body" required placeholder="Write a reply or internal note…" />
              </div>
              <div className="inline-form">
                <select name="author" defaultValue={agentList[0]}>
                  {agentList.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
                  <input type="checkbox" name="internal" style={{ width: 'auto' }} /> Internal note
                </label>
                <button type="submit">Add</button>
              </div>
            </form>
          </div>

          {waConv && (
            <div className="card">
              <h2>WhatsApp conversation</h2>
              <p className="muted">
                Live chat with {waConv.name || `+${waConv.wa_id}`}. Messages here send on WhatsApp.
              </p>
              <div className="wa-thread" style={{ maxHeight: '40vh' }}>
                {waMessages.map((m) => (
                  <div key={m.id} className={`wa-msg ${m.direction === 'out' ? 'wa-out' : 'wa-in'}`}>
                    {m.body}
                    {m.media_id ? (
                      <span className="meta">
                        <a className="row-link" href={`/api/whatsapp/media/${m.id}`} target="_blank" rel="noreferrer">
                          ↓ Download {m.filename || 'file'}
                        </a>
                      </span>
                    ) : null}
                    <span className="meta">
                      {m.direction === 'out' ? m.author || 'Team' : waConv.name || 'Customer'} ·{' '}
                      {new Date(m.created_at).toLocaleString('en-GB')}
                    </span>
                  </div>
                ))}
              </div>
              <form action={sendWaAction} className="stack" style={{ marginTop: 12 }}>
                <input type="hidden" name="conversation_id" value={waConv.id} />
                <textarea name="body" required placeholder="Message on WhatsApp…" />
                <div className="inline-form">
                  <select name="author" defaultValue={agentList[0]}>
                    {agentList.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                  <button type="submit">Send WhatsApp</button>
                </div>
              </form>
            </div>
          )}

          {ticket.customer_email && (
            <div className="card">
              <h2>Email conversation</h2>
              {emailConv && emailMessages.length > 0 ? (
                <div className="wa-thread" style={{ maxHeight: '40vh' }}>
                  {emailMessages.map((m) => (
                    <div key={m.id} className={`wa-msg ${m.direction === 'out' ? 'wa-out' : 'wa-in'}`}>
                      {m.subject ? <div style={{ fontWeight: 600, marginBottom: 4 }}>{m.subject}</div> : null}
                      {m.body}
                      {(attByMsg[m.id] || []).map((a) => (
                        <span className="meta" key={a.id}>
                          <a className="row-link" href={`/api/email/attachment/${a.id}`} target="_blank" rel="noreferrer">
                            📎 {a.filename}
                          </a>
                        </span>
                      ))}
                      <span className="meta">
                        {m.direction === 'out' ? m.author || 'Team' : emailConv.name || ticket.customer_email} ·{' '}
                        {new Date(m.created_at).toLocaleString('en-GB')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No emails with {ticket.customer_email} yet. Send one below.</p>
              )}
              <form action={emailFromTicketAction} className="stack" style={{ marginTop: 12 }}>
                <input type="hidden" name="ticket_id" value={ticket.id} />
                <textarea name="body" required placeholder="Email the customer…" />
                <div className="inline-form">
                  <select name="author" defaultValue={agentList[0]}>
                    {agentList.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                  <button type="submit">Send email</button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <h2>Details</h2>
            <p>
              <span className={`badge ${ticket.status}`}>{LABELS[ticket.status]}</span>{' '}
              <span className={`badge ${ticket.priority}`}>{LABELS[ticket.priority]}</span>
            </p>
            <p className="muted">
              {ticket.customer_name || 'Unknown'}
              <br />
              {ticket.customer_email ? (
                <Link className="row-link" href={`/customers/${encodeURIComponent(ticket.customer_email)}`}>
                  {ticket.customer_email}
                </Link>
              ) : (
                'no email'
              )}
              {ticket.order_number ? (
                <>
                  <br />
                  Order: {ticket.order_number}
                </>
              ) : null}
            </p>

            <form action={assignAction} className="inline-form" style={{ marginBottom: 10 }}>
              <input type="hidden" name="id" value={ticket.id} />
              <select name="assignee" defaultValue={ticket.assignee}>
                <option value="">Unassigned</option>
                {agentList.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <button type="submit" className="secondary">Assign</button>
            </form>

            <form action={statusAction} className="inline-form">
              <input type="hidden" name="id" value={ticket.id} />
              <select name="status" defaultValue={ticket.status}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {LABELS[s]}
                  </option>
                ))}
              </select>
              <button type="submit" className="secondary">Update</button>
            </form>
          </div>

          <div className="card">
            <h2>Reprint</h2>
            {!reprintConfigured() && (
              <p className="muted">
                Not connected — set <code>REPRINT_APP_URL</code> and <code>REPRINT_API_KEY</code>.
              </p>
            )}
            {reprintConfigured() && ticket.reprint_id && (
              <>
                {reprint ? (
                  <p>
                    <span className="badge open">{PROGRESS_LABELS[reprint.progress] || reprint.progress}</span>{' '}
                    <span className="badge">{reprint.status}</span>
                    {reprint.trackingNumber ? (
                      <>
                        <br />
                        <span className="muted">
                          {reprint.trackingCarrier || ''} {reprint.trackingNumber}
                        </span>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="muted">Linked, but status unavailable right now.</p>
                )}
                {ticket.reprint_token && (
                  <p>
                    <a className="row-link" href={reprintTrackUrl(ticket.reprint_token)} target="_blank" rel="noreferrer">
                      Customer tracking page ↗
                    </a>
                  </p>
                )}
              </>
            )}
            {reprintConfigured() && !ticket.reprint_id && (
              <form action={raiseReprintAction} className="stack">
                <input type="hidden" name="id" value={ticket.id} />
                {!ticket.order_number && (
                  <p className="muted">No order number on this ticket — the reprint will be raised without a linked order.</p>
                )}
                <div className="inline-form">
                  <select name="raisedBy" defaultValue={agentList[0]}>
                    {agentList.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                  <button type="submit">Raise reprint</button>
                </div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
                  <input type="checkbox" name="notify" defaultChecked style={{ width: 'auto' }} /> Email customer their tracking link
                </label>
              </form>
            )}
          </div>

          <div className="card">
            <h2>Shopify orders</h2>
            {!shopifyOn && (
              <p className="muted">
                Not connected yet — open the helpdesk once inside your Shopify admin (Apps → DTF Now
                Helpdesk) to link the store automatically.
              </p>
            )}
            {shopifyOn && !ticket.customer_email && <p className="muted">No customer email on this ticket.</p>}
            {orders && orders.length === 0 && <p className="muted">No orders found for {ticket.customer_email}.</p>}
            {orders &&
              orders.map((o) => (
                <div key={o.name} className="order-card">
                  <a className="row-link" href={o.adminUrl} target="_blank" rel="noreferrer">
                    {o.name}
                  </a>{' '}
                  · {new Date(o.createdAt).toLocaleDateString('en-GB')} ·{' '}
                  {o.totalPriceSet.shopMoney.amount} {o.totalPriceSet.shopMoney.currencyCode}
                  <br />
                  <span className="muted">
                    {o.displayFinancialStatus} · {o.displayFulfillmentStatus}
                  </span>
                  <br />
                  <span className="muted">
                    {o.lineItems.nodes.map((li) => `${li.quantity}× ${li.title}`).join(', ')}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}
