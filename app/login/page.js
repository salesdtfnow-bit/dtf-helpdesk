import { loginAction } from '../actions';

export const dynamic = 'force-dynamic';

export default function LoginPage({ searchParams }) {
  const error = searchParams?.error;
  const next = searchParams?.next || '/tickets';
  return (
    <div className="card" style={{ maxWidth: 380, margin: '60px auto' }}>
      <h1>Sign in</h1>
      <p className="muted">DTF Now Helpdesk staff sign in.</p>
      {error && <p className="notice">Invalid email or password, or your account has no password set yet.</p>}
      <form action={loginAction} className="stack">
        <input type="hidden" name="next" value={next} />
        <div>
          <label>Email</label>
          <input name="email" type="email" required autoComplete="username" />
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
