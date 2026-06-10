import Link from 'next/link';
import { getSql, ensureSchema, hasDb, ticketRef, LABELS, STATUSES } from '../../lib/db';

export const dynamic = 'force-dynamic';

function SetupNotice() {
  return (
    <div className="notice">
      <strong>Almost there — connect a database.</strong>
      <p>
        In your Vercel dashboard open this project → <em>Storage</em> → <em>Create Database</em> →
        choose <strong>Neon (Postgres)</strong> and accept the defaults. Vercel adds the{' '}
        <code>DATABASE_URL</code> variable automatically. Then redeploy.
      </p>
    </div>
  );
}

export default async function TicketsPage({ searchParams }) {
  if (!hasDb()) return <SetupNotice />;
  await ensureSchema();
  const sql = getSql();
  const filter = searchParams?.status || 'active';

  let tickets;
  if (filter === 'all') {
    tickets = await sql`SELECT * FROM tickets ORDER BY updated_at DESC LIMIT 200`;
  } else if (filter === 'active') {
    tickets = await sql`
      SELECT * FROM tickets WHERE status IN ('open','in_progress','waiting')
      ORDER BY updated_at DESC LIMIT 200`;
  } else {
    tickets = await sql`
      SELECT * FROM tickets WHERE status = ${filter}
      ORDER BY updated_at DESC LIMIT 200`;
  }

  return (
    <>
      <h1>Tickets</h1>
      <div className="filters">
        {['active', ...STATUSES, 'all'].map((f) => (
          <Link key={f} href={`/tickets?status=${f}`} className={filter === f ? 'active' : ''}>
            {f === 'active' ? 'Active' : f === 'all' ? 'All' : LABELS[f]}
          </Link>
        ))}
      </div>
      <div className="card">
        {tickets.length === 0 ? (
          <p className="muted">No tickets here yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Subject</th>
                <th>Customer</th>
                <th>Category</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Assignee</th>
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
                  <td>{t.customer_name || t.customer_email || '—'}</td>
                  <td className="muted">{LABELS[t.category]}</td>
                  <td>
                    <span className={`badge ${t.status}`}>{LABELS[t.status]}</span>
                  </td>
                  <td>
                    <span className={`badge ${t.priority}`}>{LABELS[t.priority]}</span>
                  </td>
                  <td>{t.assignee || <span className="muted">Unassigned</span>}</td>
                  <td className="muted">{new Date(t.updated_at).toLocaleString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
