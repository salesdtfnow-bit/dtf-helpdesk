import { EMBED_COOKIE, makeEmbedCookieValue } from '../../../../lib/embed';

// Exchanges a Shopify App Bridge session token (JWT, HS256-signed with the app
// secret) for our embed session cookie. Used by the embedded admin app.

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function verifySessionToken(token, secret, apiKey) {
  if (!token || !secret || !apiKey) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), enc.encode(`${h}.${p}`));
  if (!ok) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp + 10) return null;
  if (payload.nbf && now < payload.nbf - 10) return null;
  if (payload.aud !== apiKey) return null;
  if (!/^https:\/\/[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(payload.dest || '')) return null;
  return payload;
}

export async function POST(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const payload = await verifySessionToken(
    token,
    process.env.SHOPIFY_APP_SECRET,
    process.env.SHOPIFY_APP_KEY
  );
  if (!payload) {
    return new Response(JSON.stringify({ error: 'invalid session token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const shop = payload.dest.replace(/^https:\/\//, '');
  const cookieValue = await makeEmbedCookieValue(shop);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${EMBED_COOKIE}=${cookieValue}; Path=/; Max-Age=43200; Secure; HttpOnly; SameSite=None`,
    },
  });
}
