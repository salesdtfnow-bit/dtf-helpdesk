import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getSql, ensureSchema, hasDb } from './db';
import { STAFF_COOKIE, verifyStaffSession } from './session';
import { EMBED_COOKIE, verifyEmbedCookieValue } from './embed';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  const test = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// The signed-in user: a staff session, or a Shopify-embed owner (treated as admin
// because only the store owner can open the app inside Shopify admin).
export async function currentUser() {
  const jar = cookies();
  const staffCookie = jar.get(STAFF_COOKIE)?.value;
  if (staffCookie) {
    const s = await verifyStaffSession(staffCookie);
    if (s) return { ...s, source: 'staff' };
  }
  const embed = jar.get(EMBED_COOKIE)?.value;
  if (embed && (await verifyEmbedCookieValue(embed))) {
    return { id: 0, email: 'owner', name: 'Owner', role: 'admin', source: 'embed' };
  }
  return null;
}

export async function requireAdmin() {
  const u = await currentUser();
  if (!u || u.role !== 'admin') throw new Error('forbidden');
  return u;
}

function envAgents() {
  return (process.env.AGENTS || 'Vitalijs')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
}

// Active staff names, used to populate assignee dropdowns.
export async function getAgents() {
  if (!hasDb()) return envAgents();
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`SELECT name FROM staff WHERE active = true ORDER BY role DESC, name ASC`;
    if (rows.length) return rows.map((r) => r.name);
  } catch (e) {
    console.error('getAgents failed:', e.message);
  }
  return envAgents();
}

export async function getStaff() {
  await ensureSchema();
  const sql = getSql();
  return sql`
    SELECT id, name, email, role, active, slack_id, (password_hash <> '') AS has_password
    FROM staff ORDER BY role DESC, name ASC`;
}
