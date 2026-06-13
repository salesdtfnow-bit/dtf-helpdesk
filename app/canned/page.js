import { getSql, ensureSchema, hasDb } from '../../lib/db';
import { addCannedAction, deleteCannedAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CannedPage() {
  if (!hasDb()) {
    return (
      <div className="card">
        <h2>Canned replies</h2>
        <p className="muted">Database not configured.</p>
      </div>
    );
  }
  await ensureSchema();
  const sql = getSql();
  const replies = await sql`SELECT * FROM canned_replies ORDER BY title ASC`;
  return (
    <>
      <h1>Canned replies</h1>
      <p className="muted">Saved answers you can insert into any ticket reply with one click.</p>
      <div className="card">
        {replies.length === 0 && <p className="muted">None yet.</p>}
        {replies.map((r) => (
          <div key={r.id} className="comment">
            <div className="meta">
              <strong>{r.title}</strong>
            </div>
            <div className="desc">{r.body}</div>
            <form action={deleteCannedAction} style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className="secondary">
                Delete
              </button>
            </form>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>Add a canned reply</h2>
        <form action={addCannedAction} className="stack">
          <div>
            <label>Title</label>
            <input name="title" required placeholder="e.g. Press settings" />
          </div>
          <div>
            <label>Body</label>
            <textarea name="body" required placeholder="The reply text…" />
          </div>
          <button type="submit">Save</button>
        </form>
      </div>
    </>
  );
}
