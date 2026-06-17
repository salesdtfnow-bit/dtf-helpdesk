import { CATEGORIES, PRIORITIES, LABELS, agents } from '../../../lib/db';
import { createTicketAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default function NewTicketPage({ searchParams }) {
  const orderError = searchParams?.error === 'order';
  return (
    <>
      <h1>New ticket</h1>
      <div className="card">
        {orderError && (
          <div className="notice" style={{ marginBottom: 16 }}>
            A Shopify order number is required to raise a ticket.
          </div>
        )}
        <form action={createTicketAction} className="stack">
          <div>
            <label>Subject</label>
            <input name="subject" required maxLength={300} />
          </div>
          <div>
            <label>Description</label>
            <textarea name="description" />
          </div>
          <div>
            <label>Category</label>
            <select name="category" defaultValue="other">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Priority</label>
            <select name="priority" defaultValue="normal">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Customer name</label>
            <input name="customer_name" />
          </div>
          <div>
            <label>Customer email</label>
            <input name="customer_email" type="email" />
          </div>
          <div>
            <label>Shopify order number</label>
            <input name="order_number" required placeholder="e.g. DTFN26341" />
          </div>
          <div>
            <label>Attach files (optional)</label>
            <input name="files" type="file" multiple accept="image/*,.pdf,.ai,.eps,.svg,.zip" />
            <p className="muted" style={{ marginTop: 4 }}>
              Artwork or photos — matched to the order number above. Max ~25 MB total.
            </p>
          </div>
          <div>
            <label>Assign to</label>
            <select name="assignee" defaultValue="">
              <option value="">Unassigned</option>
              {agents().map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <input type="hidden" name="channel" value="manual" />
          <div>
            <button type="submit">Create ticket</button>
          </div>
        </form>
      </div>
    </>
  );
}
