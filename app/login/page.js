import { loginAction } from '../actions';

export const dynamic = 'force-dynamic';

export default function LoginPage({ searchParams }) {
  const error = searchParams?.error;
  const next = searchParams?.next || '/tickets';
  return (
    <div className="card" style={{ maxWidth: 380, margin: '60px auto' }}>
      <h1>Sign in</h1>
      <p className="muted">DTF Now Helpdesk staff sign in.</p>
      <p className="muted">Sign in with your name (as set by your admin) or your Slack member ID.</p>
      {error === 'ambiguous' ? (
        <p className="notice">
          More than one staff member matches that name. Sign in with your Slack member ID instead, or
          ask your admin to make the names unique.
        </p>
      ) : (
        error && (
          <p className="notice">
            Invalid name, Slack ID or password, or your account has no password set yet.
          </p>
        )
      )}
      <form action={loginAction} className="stack">
        <input type="hidden" name="next" value={next} />
        <div>
          <label>Name or Slack ID</label>
          <input name="login" type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} />
        </div>
        <div>
          <label>Password</label>
          <input name="password" type="password" required autoComplete="current-password" />
        </div>
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
}
