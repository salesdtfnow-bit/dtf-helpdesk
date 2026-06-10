import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getSql,
  ensureSchema,
  hasDb,
  ticketRef,
  LABELS,
  STATUSES,
  agents,
} from '../../../lib/db';
import { recentOrdersByEmail, shopifyConfigured } from '../../../lib/shopify';
import { reprintConfigured, getReprint, reprintTrackUrl } from '../../../lib/reprint';
import { assignAction, statusAction, commentAction, raiseReprintAction } from '../../actions';

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
  const comments = await sql`
    SELECT * FROM comments WHERE ticket_id = ${id} ORDER BY created_at ASC`;
  const shopifyOn = await shopifyConfigured();
  const orders = await recentOrdersByEmail(ticket.customer_email);
  const reprint = ticket.reprint_id ? await getReprint(ticket.reprint_id) : null;

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
            <h2>Description</h2>
            <div className="desc">{ticket.description || '—'}</div>
          </div>

          <div className="card">
            <h2>Conversation</h2>
            <p className="muted">
              Replies (not internal notes) are emailed to the customer automatically.
            </p>
            {comments.length === 0 && <p className="muted">No replies yet.</p>}
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
                <textarea name="body" required placeholder="Write a reply or internal note…" />
              </div>
              <div className="inline-form">
                <select name="author" defaultValue={agents()[0]}>
                  {agents().map((a) => (
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
                <Link
                  className="row-link"
                  href={`/customers/${encodeURIComponent(ticket.customer_email)}`}
                >
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
                {agents().map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <button type="submit" className="secondary">
                Assign
              </button>
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
              <button type="submit" className="secondary">
                Update
              </button>
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
                    <a
                      className="row-link"
                      href={reprintTrackUrl(ticket.reprint_token)}
                      target="_blank"
                      rel="noreferrer"
                    >
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
                  <p className="muted">
                    No order number on this ticket — the reprint will be raised without a linked
                    order.
                  </p>
                )}
                <div className="inline-form">
                  <select name="raisedBy" defaultValue={agents()[0]}>
                    {agents().map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                  <button type="submit">Raise reprint</button>
                </div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
                  <input type="checkbox" name="notify" defaultChecked style={{ width: 'auto' }} />{' '}
                  Email customer their tracking link
                </label>
              </form>
            )}
          </div>

          <div className="card">
            <h2>Shopify orders</h2>
            {!shopifyOn && (
              <p className="muted">
                Not connected yet — open the helpdesk once inside your Shopify admin (Apps → DTF
                Now Helpdesk) to link the store automatically.
              </p>
            )}
            {shopifyOn && !ticket.customer_email && (
              <p className="muted">No customer email on this ticket.</p>
            )}
            {orders && orders.length === 0 && (
              <p className="muted">No orders found for {ticket.customer_email}.</p>
            )}
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
