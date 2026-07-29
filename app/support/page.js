import { CATEGORIES, LABELS } from '../../lib/db';
import { uploadPageUrl } from '../../lib/uploads';
import { publicTicketAction } from '../actions';

export const dynamic = 'force-dynamic';

export default function SupportPage() {
  const uploadUrl = uploadPageUrl();
  return (
    <>
      <h1>Contact DTF Now support</h1>
      <p className="muted">
        Tell us what&apos;s wrong and we&apos;ll get back to you as soon as possible. If it&apos;s
        about an order, include your order number (it&apos;s in your confirmation email).
      </p>
      <div className="card">
        <form action={publicTicketAction} className="stack">
          <div>
            <label>Your name</label>
            <input name="customer_name" required />
          </div>
          <div>
            <label>Email</label>
            <input name="customer_email" type="email" required />
          </div>
          <div>
            <label>Order number (optional)</label>
            <input name="order_number" placeholder="e.g. DTFN23303" />
          </div>
          <div>
            <label>What do you need help with?</label>
            <select name="category" defaultValue="other">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Subject</label>
            <input name="subject" required maxLength={300} />
          </div>
          <div>
            <label>Details</label>
            <textarea
              name="description"
              required
              placeholder="Describe the issue — for print quality problems, what happened during pressing (temperature, time, pressure) helps us help you faster."
            />
          </div>
          {uploadUrl && (
            <label
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                fontWeight: 400,
                background: '#fff8e6',
                border: '1px solid #f1d48a',
                borderRadius: 8,
                padding: '12px 14px',
              }}
            >
              <input type="checkbox" name="needs_files" style={{ width: 'auto', marginTop: 3 }} />
              <span>
                I need to send artwork or photos. We&apos;ll take you to our secure upload page next
                (up to 50&nbsp;MB per file) — have your order number ready.
              </span>
            </label>
          )}
          <div>
            <button type="submit">Send</button>
          </div>
        </form>
      </div>
    </>
  );
}
