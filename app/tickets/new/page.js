import { CATEGORIES, PRIORITIES, LABELS, agents } from '../../../lib/db';
import { createTicketAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default function NewTicketPage() {
  return (
    <>
      <h1>New ticket</h1>
      <div className="card">
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
            <label>Shopify order number (optional)</label>
            <input name="order_number" placeholder="#1234" />
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
