import { hmacHex } from '../../../../lib/embed';

// Starts the OAuth grant for the embedded app.
// Responds with HTML that breaks out of the admin iframe (OAuth can't render inside it).
export async function GET(req) {
  const url = new URL(req.url);
  const shop = url.searchParams.get('shop') || '';
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    return new Response('Invalid shop parameter', { status: 400 });
  }
  if (!process.env.SHOPIFY_APP_KEY || !process.env.SHOPIFY_APP_SECRET) {
    return new Response(
      'Set SHOPIFY_APP_KEY and SHOPIFY_APP_SECRET environment variables first.',
      { status: 500 }
    );
  }

  const appUrl = process.env.APP_URL || `https://${url.host}`;
  const state = await hmacHex(process.env.SHOPIFY_APP_SECRET, `${shop}|state`);
  const authorize =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(process.env.SHOPIFY_APP_KEY)}` +
    `&scope=${encodeURIComponent('read_orders,read_customers')}` +
    `&redirect_uri=${encodeURIComponent(`${appUrl}/api/shopify/callback`)}` +
    `&state=${state}`;

  // Top-level redirect (escapes the iframe when embedded).
  const html = `<!DOCTYPE html><html><body><script>
    if (window.top === window.self) { window.location.href = ${JSON.stringify(authorize)}; }
    else { window.top.location.href = ${JSON.stringify(authorize)}; }
  </script></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
