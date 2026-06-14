import Link from 'next/link';
import { getSql, ensureSchema, hasDb } from '../../lib/db';
import { getAgents } from '../../lib/auth';
import { emailConfigured } from '../../lib/email';
import AutoRefresh from '../whatsapp/AutoRefresh';

export const dynamic = 'force-dynamic';

export default async function EmailListPage({ searchParams }) {
  if (!hasDb()) {
    return (
      <div className="card">
        <h2>Email</h2>
        <p className="muted">Database not configured.</p>
      </div>
    );
  }
  await ensureSchema();
  const sql = getSql();
  const agentList = await getAgents();
  const filter = searchParams?.assignee || '';
  const convos = filter
    ? await sql`
        SELECT c.*, (SELECT body FROM email_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body
        FROM email_conversations c WHERE c.assignee = ${filter} ORDER BY c.last_message_at DESC`
    : await sql`
        SELECT c.*, (SELECT body FROM email_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body
        FROM email_conversations c ORDER BY c.last_message_at DESC`;

  return (
    <>
      <AutoRefresh seconds={15} />
      <h1>Email</h1>
      {!emailConfigured() && (
        <p className="notice">
          Outbound email not configured — set RESEND_API_KEY to send replies. Inbound email needs
          SendGrid Inbound Parse pointed at /api/inbound-email.
        </p>
      )}
      <div className="filters">
        <Link href="/email" className={!filter ? 'active' : ''}>
          All
        </Link>
        {agentList.map((a) => (
          <Link
            key={a}
            href={`/email?assignee=${encodeURIComponent(a)}`}
            className={filter === a ? 'active' : ''}
          >
            {a}
          </Link>
        ))}
      </div>
      {convos.length === 0 && <p className="muted">No emails yet.</p>}
      {convos.map((c) => (
        <Link key={c.id} href={`/email/${c.id}`} className="wa-conv">
          <div>
            <strong>{c.name || c.email}</strong>
            <div className="muted" style={{ fontSize: 12 }}>{c.email}</div>
            <div className="snippet">{c.last_body || '—'}</div>
          </div>
          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            {c.unread > 0 && <span className="wa-unread">{c.unread}</span>}
            <div className="muted" style={{ marginTop: 4 }}>{c.assignee || 'Unassigned'}</div>
            <div className="muted">
              {new Date(c.last_message_at).toLocaleString('en-GB', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })}
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}
