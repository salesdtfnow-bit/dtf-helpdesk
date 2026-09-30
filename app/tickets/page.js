import Link from 'next/link';
import { getSql, ensureSchema, hasDb, ticketRef, LABELS, STATUSES } from '../../lib/db';
import { currentUser } from '../../lib/auth';

export const dynamic = 'force-dynamic';

const ACTIVE = ['open', 'in_progress', 'waiting'];

// Compact time since a date: "5m", "3h", "2d".
function age(value) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

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
  const me = await currentUser();
  const myName = me?.name || '';

  let tickets;
  if (filter === 'mine') {
    tickets = myName
      ? await sql`
          SELECT * FROM tickets WHERE status IN ('open','in_progress','waiting') AND assignee = ${myName}
          ORDER BY updated_at DESC LIMIT 200`
      : [];
  } else if (filter === 'unassigned') {
    tickets = await sql`
      SELECT * FROM tickets WHERE status IN ('open','in_progress','waiting') AND assignee = ''
      ORDER BY updated_at DESC LIMIT 200`;
  } else if (filter === 'all') {
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

  // Counts for the filter tabs (Mine / Unassigned count active tickets only, like their lists).
  const [counts] = await sql`
    SELECT
      COUNT(*)::int AS "all",
      COUNT(*) FILTER (WHERE status IN ('open','in_progress','waiting'))::int AS active,
      COUNT(*) FILTER (WHERE status = 'open')::int AS open,
      COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
      COUNT(*) FILTER (WHERE status = 'waiting')::int AS waiting,
      COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
      COUNT(*) FILTER (WHERE status = 'closed')::int AS closed,
      COUNT(*) FILTER (WHERE status IN ('open','in_progress','waiting') AND assignee = ${myName} AND assignee <> '')::int AS mine,
      COUNT(*) FILTER (WHERE status IN ('open','in_progress','waiting') AND assignee = '')::int AS unassigned
    FROM tickets`;
  const tabLabel = (f) =>
    f === 'active' ? 'Active' : f === 'all' ? 'All' : f === 'mine' ? 'Mine' : f === 'unassigned' ? 'Unassigned' : LABELS[f];

  return (
    <>
      <h1>Tickets</h1>
      <div className="filters">
        {['active', 'mine', 'unassigned', ...STATUSES, 'all'].map((f) => (
          <Link key={f} href={`/tickets?status=${f}`} className={filter === f ? 'active' : ''}>
            {tabLabel(f)} <span className="filter-count">{counts?.[f] ?? 0}</span>
          </Link>
        ))}
      </div>
      <div className="card">
        {tickets.length === 0 ? (
          <p className="muted">No tickets here yet.</p>
        ) : (
          <div className="table-scroll">
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
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link className="row-link" href={`/tickets/${t.id}?status=${filter}`}>
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
                  <td
                    className={`nowrap ${
                      ACTIVE.includes(t.status) && Date.now() - new Date(t.updated_at).getTime() > 24 * 3600 * 1000
                        ? 'age-stale'
                        : 'muted'
                    }`}
                    title="Time since last update"
                  >
                    {age(t.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  );
}
