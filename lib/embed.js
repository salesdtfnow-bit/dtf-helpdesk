// Embedded-session cookie helpers (Web Crypto — works in Edge middleware and Node).
export const EMBED_COOKIE = 'dtf_embed';

export async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function makeEmbedCookieValue(shop) {
  const exp = Date.now() + 12 * 60 * 60 * 1000; // 12h
  const sig = await hmacHex(process.env.SHOPIFY_APP_SECRET, `${shop}|${exp}`);
  return `${shop}|${exp}|${sig}`;
}

export async function verifyEmbedCookieValue(value) {
  if (!value || !process.env.SHOPIFY_APP_SECRET) return false;
  const parts = value.split('|');
  if (parts.length !== 3) return false;
  const [shop, exp, sig] = parts;
  if (Date.now() > Number(exp)) return false;
  const expected = await hmacHex(process.env.SHOPIFY_APP_SECRET, `${shop}|${exp}`);
  return expected === sig;
}
