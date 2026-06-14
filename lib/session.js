// Edge-safe staff session cookie (Web Crypto — works in middleware and Node).
export const STAFF_COOKIE = 'dtf_staff';

function secret() {
  return process.env.AUTH_SECRET || process.env.SHOPIFY_APP_SECRET || 'dev-secret';
}

async function hmacHex(message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function makeStaffSession({ id, email, name, role }) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = b64urlEncode(JSON.stringify({ id, email, name, role, exp }));
  const sig = await hmacHex(payload);
  return `${payload}.${sig}`;
}

export async function verifyStaffSession(value) {
  if (!value || !value.includes('.')) return null;
  const [payload, sig] = value.split('.');
  const expected = await hmacHex(payload);
  if (expected !== sig) return null;
  let data;
  try {
    data = JSON.parse(b64urlDecode(payload));
  } catch {
    return null;
  }
  if (!data.exp || Date.now() > data.exp) return null;
  return data;
}
