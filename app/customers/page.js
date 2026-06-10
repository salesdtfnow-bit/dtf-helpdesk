import Link from 'next/link';
import { getSql, ensureSchema, hasDb } from '../../lib/db';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  if (!hasDb()) {
    return <div className="notice">Connect a database first (see Tickets page).</div>;
  }
  await ensureSchema();
  const sql = getSql();
  const customers = await sql`
    SELECT customer_email AS email,
           MAX(NULLIF(customer_name, '')) AS name,
           COUNT(*)::int AS tickets,
           (COUNT(*) FILTER (WHERE status IN ('open','in_progress','waiting')))::int AS active,
           MAX(updated_at) AS last_activity
    FROM tickets
    WHERE customer_email <> ''
    GROUP BY customer_email
    ORDER BY MAX(updated_at) DESC
    LIMIT 200`;

  return (
    <>
      <h1>Customers</h1>
      <div className="card">
        {customers.length === 0 ? (
          <p className="muted">
            No customers yet — they appear here automatically once tickets come in with an email
            address.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Email</th>
                <th>Tickets</th>
                <th>Active</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.email}>
                  <td>
                    <Link className="row-link" href={`/customers/${encodeURIComponent(c.email)}`}>
                      {c.name || c.email}
                    </Link>
                  </td>
                  <td className="muted">{c.email}</td>
                  <td>{c.tickets}</td>
                  <td>{c.active > 0 ? <span className="badge open">{c.active}</span> : '—'}</td>
                  <td className="muted">{new Date(c.last_activity).toLocaleString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
