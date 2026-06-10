import { EMBED_COOKIE, makeEmbedCookieValue } from '../../../../lib/embed';
import { getSql, ensureSchema, hasDb } from '../../../../lib/db';

// Exchanges a Shopify App Bridge session token (JWT, HS256-signed with the app
// secret) for our embed session cookie, and swaps it for an offline Admin API
// access token (token exchange) which is stored in the DB for data lookups.

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

async function exchangeForOfflineToken(shop, sessionToken) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_APP_KEY,
      client_secret: process.env.SHOPIFY_APP_SECRET,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: sessionToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token;
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

  // Store/refresh the offline Admin API token for data lookups.
  if (hasDb()) {
    try {
      const accessToken = await exchangeForOfflineToken(shop, token);
      if (accessToken) {
        await ensureSchema();
        const sql = getSql();
        await sql`
          INSERT INTO shop_tokens (shop, token, updated_at)
          VALUES (${shop}, ${accessToken}, now())
          ON CONFLICT (shop) DO UPDATE SET token = EXCLUDED.token, updated_at = now()`;
      }
    } catch (e) {
      console.error('Offline token exchange failed:', e.message);
    }
  }

  const cookieValue = await makeEmbedCookieValue(shop);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${EMBED_COOKIE}=${cookieValue}; Path=/; Max-Age=43200; Secure; HttpOnly; SameSite=None`,
    },
  });
}
