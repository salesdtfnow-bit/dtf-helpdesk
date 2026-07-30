import { CATEGORIES, LABELS } from '../../lib/db';
import { publicTicketAction } from '../actions';
import SubmitButton from '../SubmitButton';

export const dynamic = 'force-dynamic';

export default function SupportPage({ searchParams }) {
  const orderError = searchParams?.error === 'order';
  return (
    <>
      <h1>Contact DTF Now support</h1>
      <p className="muted">
        Tell us what&apos;s wrong and we&apos;ll get back to you as soon as possible. Please include
        your DTFN order number — it&apos;s in your order confirmation email.
      </p>
      <div className="card">
        {orderError && (
          <div className="notice" style={{ marginBottom: 16 }}>
            Please enter your DTFN order number so we can find your order.
          </div>
        )}
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
            <label>Order number</label>
            <input name="order_number" required placeholder="e.g. DTFN23303" />
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
          <div>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
              <input type="checkbox" name="needs_files" style={{ width: 'auto' }} /> I need to send
              artwork or photos
            </label>
            <p className="muted" style={{ marginTop: 4 }}>
              Tick this and we&apos;ll take you to our secure upload page next — up to 50 MB per
              file, and it matches the files to your order automatically (you&apos;ll need your
              order number).
            </p>
          </div>
          <div>
            <SubmitButton pendingText="Sending…">Send</SubmitButton>
          </div>
        </form>
      </div>
    </>
  );
}
