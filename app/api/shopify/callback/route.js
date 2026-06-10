import { hmacHex, makeEmbedCookieValue, EMBED_COOKIE } from '../../../../lib/embed';

// OAuth callback: verifies Shopify's HMAC + state, completes the token exchange,
// sets the embed session cookie and returns to the admin.
export async function GET(req) {
  const url = new URL(req.url);
  const params = url.searchParams;
  const shop = params.get('shop') || '';
  const hmac = params.get('hmac') || '';
  const code = params.get('code') || '';
  const state = params.get('state') || '';
  const secret = process.env.SHOPIFY_APP_SECRET;

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) || !secret) {
    return new Response('Bad request', { status: 400 });
  }

  // Verify state
  const expectedState = await hmacHex(secret, `${shop}|state`);
  if (state !== expectedState) {
    return new Response('Invalid state', { status: 403 });
  }

  // Verify HMAC: sorted query string without hmac, HMAC-SHA256 with app secret
  const pairs = [];
  for (const [k, v] of [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (k !== 'hmac') pairs.push(`${k}=${v}`);
  }
  const digest = await hmacHex(secret, pairs.join('&'));
  if (digest !== hmac) {
    return new Response('Invalid HMAC', { status: 403 });
  }

  // Complete the OAuth code exchange (required for the install to register).
  try {
    await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_APP_KEY,
        client_secret: secret,
        code,
      }),
    });
  } catch (e) {
    console.error('Token exchange failed:', e.message);
  }

  const cookieValue = await makeEmbedCookieValue(shop);
  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    `${EMBED_COOKIE}=${cookieValue}; Path=/; Max-Age=43200; Secure; HttpOnly; SameSite=None`
  );
  headers.append('Location', '/tickets');
  return new Response(null, { status: 302, headers });
}
