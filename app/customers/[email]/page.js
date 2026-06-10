import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSql, ensureSchema, hasDb, ticketRef, LABELS, agents } from '../../../lib/db';
import { customerByEmail, recentOrdersByEmail, shopifyConfigured } from '../../../lib/shopify';
import { customerNoteAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function CustomerPage({ params }) {
  if (!hasDb()) notFound();
  await ensureSchema();
  const sql = getSql();
  const email = decodeURIComponent(params.email);

  const tickets = await sql`
    SELECT * FROM tickets WHERE customer_email = ${email} ORDER BY updated_at DESC`;
  const notes = await sql`
    SELECT * FROM customer_notes WHERE email = ${email} ORDER BY created_at DESC`;
  const shopifyOn = await shopifyConfigured();
  const [shopifyCustomer, orders] = await Promise.all([
    customerByEmail(email),
    recentOrdersByEmail(email),
  ]);

  const name =
    (shopifyCustomer && `${shopifyCustomer.firstName || ''} ${shopifyCustomer.lastName || ''}`.trim()) ||
    tickets.find((t) => t.customer_name)?.customer_name ||
    email;

  return (
    <>
      <h1>{name}</h1>
      <p className="muted">{email}</p>

      <div className="grid">
        <div>
          <div className="card">
            <h2>Tickets ({tickets.length})</h2>
            {tickets.length === 0 && <p className="muted">No tickets for this customer.</p>}
            {tickets.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link className="row-link" href={`/tickets/${t.id}`}>
                          {ticketRef(t.id)}
                        </Link>
                      </td>
                      <td>{t.subject}</td>
                      <td>
                        <span className={`badge ${t.status}`}>{LABELS[t.status]}</span>
                      </td>
                      <td className="muted">{new Date(t.updated_at).toLocaleString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2>Notes</h2>
            {notes.length === 0 && <p className="muted">No notes yet.</p>}
            {notes.map((n) => (
              <div key={n.id} className="comment internal">
                <div className="meta">
                  <strong>{n.author}</strong> · {new Date(n.created_at).toLocaleString('en-GB')}
                </div>
                <div className="desc">{n.body}</div>
              </div>
            ))}
            <form action={customerNoteAction} className="stack" style={{ marginTop: 16 }}>
              <input type="hidden" name="email" value={email} />
              <div>
                <label>Add note</label>
                <textarea
                  name="body"
                  required
                  placeholder="e.g. prefers DPD, always orders gang sheets, VIP — priority handling"
                />
              </div>
              <div className="inline-form">
                <select name="author" defaultValue={agents()[0]}>
                  {agents().map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
                <button type="submit">Save note</button>
              </div>
            </form>
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Shopify profile</h2>
            {!shopifyOn && (
              <p className="muted">
                Not connected yet — open the helpdesk once inside your Shopify admin (Apps → DTF
                Now Helpdesk) to link the store automatically.
              </p>
            )}
            {shopifyOn && !shopifyCustomer && (
              <p className="muted">No Shopify customer found for this email.</p>
            )}
            {shopifyCustomer && (
              <p>
                <strong>
                  {shopifyCustomer.amountSpent.amount} {shopifyCustomer.amountSpent.currencyCode}
                </strong>{' '}
                lifetime spend
                <br />
                <span className="muted">
                  {shopifyCustomer.numberOfOrders} orders · customer since{' '}
                  {new Date(shopifyCustomer.createdAt).toLocaleDateString('en-GB')}
                  {shopifyCustomer.phone ? (
                    <>
                      <br />
                      {shopifyCustomer.phone}
                    </>
                  ) : null}
                </span>
              </p>
            )}
          </div>

          <div className="card">
            <h2>Recent orders</h2>
            {orders && orders.length === 0 && <p className="muted">No orders found.</p>}
            {!orders && shopifyOn && <p className="muted">—</p>}
            {orders &&
              orders.map((o) => (
                <div key={o.name} className="order-card">
                  <strong>{o.name}</strong> · {new Date(o.createdAt).toLocaleDateString('en-GB')} ·{' '}
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
