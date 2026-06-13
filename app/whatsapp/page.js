import Link from 'next/link';
import { getSql, ensureSchema, hasDb, agents } from '../../lib/db';
import { whatsappConfigured } from '../../lib/whatsapp';
import AutoRefresh from './AutoRefresh';

export const dynamic = 'force-dynamic';

export default async function WhatsAppListPage({ searchParams }) {
  if (!hasDb()) {
    return (
      <div className="card">
        <h2>WhatsApp</h2>
        <p className="muted">Database not configured.</p>
      </div>
    );
  }
  await ensureSchema();
  const sql = getSql();
  const filter = searchParams?.assignee || '';
  const convos = filter
    ? await sql`
        SELECT c.*, (SELECT body FROM wa_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body
        FROM wa_conversations c WHERE c.assignee = ${filter} ORDER BY c.last_message_at DESC`
    : await sql`
        SELECT c.*, (SELECT body FROM wa_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body
        FROM wa_conversations c ORDER BY c.last_message_at DESC`;

  return (
    <>
      <AutoRefresh seconds={10} />
      <h1>WhatsApp</h1>
      {!whatsappConfigured() && (
        <p className="notice">
          WhatsApp not connected yet — add WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID and
          WHATSAPP_VERIFY_TOKEN, then point your Meta webhook at /api/whatsapp/webhook.
        </p>
      )}
      <div className="filters">
        <Link href="/whatsapp" className={!filter ? 'active' : ''}>
          All
        </Link>
        {agents().map((a) => (
          <Link
            key={a}
            href={`/whatsapp?assignee=${encodeURIComponent(a)}`}
            className={filter === a ? 'active' : ''}
          >
            {a}
          </Link>
        ))}
      </div>
      {convos.length === 0 && <p className="muted">No conversations yet.</p>}
      {convos.map((c) => (
        <Link key={c.id} href={`/whatsapp/${c.id}`} className="wa-conv">
          <div>
            <strong>{c.name || `+${c.wa_id}`}</strong>
            <div className="snippet">{c.last_body || '—'}</div>
          </div>
          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            {c.unread > 0 && <span className="wa-unread">{c.unread}</span>}
            <div className="muted" style={{ marginTop: 4 }}>
              {c.assignee || 'Unassigned'}
            </div>
            <div className="muted">
              {new Date(c.last_message_at).toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}
