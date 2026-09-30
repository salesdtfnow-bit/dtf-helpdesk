import { getStaff } from '../../lib/auth';
import { hasDb } from '../../lib/db';
import {
  addStaffAction,
  updateStaffAction,
  setStaffPasswordAction,
  setStaffActiveAction,
  setStaffRoleAction,
  deleteStaffAction,
} from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminPage({ searchParams }) {
  if (!hasDb()) {
    return (
      <div className="card">
        <h2>Admin</h2>
        <p className="muted">Database not configured.</p>
      </div>
    );
  }
  const staff = await getStaff();
  const error = typeof searchParams?.error === 'string' ? searchParams.error : '';
  const ok = typeof searchParams?.ok === 'string' ? searchParams.ok : '';
  return (
    <>
      <h1>Admin · Staff</h1>
      <p className="muted">
        Add or remove staff, set roles and passwords. Staff sign in at /login with their email and
        password. Admins can access this page; agents cannot.
      </p>

      {(error || ok) && (
        <div className={`notice ${error ? 'notice-error' : 'notice-ok'}`} role={error ? 'alert' : 'status'}>
          {error || ok}{' '}
          <a href="/admin" className="notice-dismiss" aria-label="Dismiss">
            ×
          </a>
        </div>
      )}

      <div className="card">
        <h2>Team</h2>
        <div className="table-scroll">
          <table className="wide">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Password</th>
                <th>Status</th>
                <th>Set password</th>
                <th>Details</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td className="muted nowrap">{m.email}</td>
                  <td>
                    <form action={setStaffRoleAction} className="inline-form">
                      <input type="hidden" name="id" value={m.id} />
                      <select name="role" defaultValue={m.role}>
                        <option value="agent">Agent</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button type="submit" className="secondary">Save</button>
                    </form>
                  </td>
                  <td>
                    <span className={`badge ${m.has_password ? 'resolved' : 'urgent'}`}>
                      {m.has_password ? 'Set' : 'Not set'}
                    </span>
                  </td>
                  <td>
                    <form action={setStaffActiveAction} className="inline-form">
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="active" value={(!m.active).toString()} />
                      <button type="submit" className="secondary">
                        {m.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </form>
                  </td>
                  <td>
                    <form action={setStaffPasswordAction} className="inline-form">
                      <input type="hidden" name="id" value={m.id} />
                      <input
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="New password"
                        style={{ width: 150 }}
                      />
                      <button type="submit" className="secondary">Set</button>
                    </form>
                  </td>
                  <td>
                    <details className="staff-edit">
                      <summary>Edit</summary>
                      <form action={updateStaffAction} className="stack" autoComplete="off">
                        <input type="hidden" name="id" value={m.id} />
                        <div>
                          <label>Name</label>
                          <input name="name" required defaultValue={m.name} autoComplete="off" />
                        </div>
                        <div>
                          <label>Email</label>
                          <input name="email" type="email" required defaultValue={m.email} autoComplete="off" />
                        </div>
                        <div>
                          <label>Slack member ID</label>
                          <input name="slack_id" defaultValue={m.slack_id} placeholder="U0XXXXXXXXX" autoComplete="off" />
                        </div>
                        <button type="submit" className="secondary">Save details</button>
                      </form>
                    </details>
                  </td>
                  <td>
                    <form action={deleteStaffAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className="secondary">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Add staff member</h2>
        <form action={addStaffAction} className="stack" autoComplete="off">
          <div>
            <label>Name</label>
            <input name="name" required placeholder="e.g. Jess" autoComplete="off" />
          </div>
          <div>
            <label>Email (used to sign in)</label>
            <input name="email" type="email" required placeholder="jess@dtfnow.co.uk" autoComplete="off" />
          </div>
          <div>
            <label>Role</label>
            <select name="role" defaultValue="agent">
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label>Password</label>
            <input name="password" type="password" placeholder="Set an initial password" autoComplete="new-password" />
          </div>
          <div>
            <label>Slack member ID (optional, for @mentions)</label>
            <input name="slack_id" placeholder="U0XXXXXXXXX" autoComplete="off" />
          </div>
          <button type="submit">Add staff member</button>
        </form>
      </div>
    </>
  );
}
