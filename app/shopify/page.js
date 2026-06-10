import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { EMBED_COOKIE, verifyEmbedCookieValue } from '../../lib/embed';

export const dynamic = 'force-dynamic';

// Entry point for the embedded Shopify admin app (managed install / token exchange).
// Loads App Bridge, obtains a session token, exchanges it for our embed cookie,
// then navigates to the helpdesk inside the admin iframe.
export default async function ShopifyEntry() {
  const cookie = cookies().get(EMBED_COOKIE)?.value;
  if (cookie && (await verifyEmbedCookieValue(cookie))) {
    redirect('/tickets');
  }

  const apiKey = process.env.SHOPIFY_APP_KEY || '';
  return (
    <>
      {/* App Bridge must load before the inline script runs */}
      <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key={apiKey} />
      <div className="card" style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
        <h1>DTF Now Helpdesk</h1>
        <p className="muted" id="embed-status">
          Connecting to Shopify…
        </p>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
(async function () {
  var el = document.getElementById('embed-status');
  function msg(t) { if (el) el.textContent = t; }
  try {
    if (typeof shopify === 'undefined' || !shopify.idToken) {
      msg('Open this app from inside your Shopify admin (Apps → DTF Now Helpdesk).');
      return;
    }
    var token = await shopify.idToken();
    var res = await fetch('/api/shopify/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    });
    if (res.ok) {
      window.location.href = '/tickets';
    } else {
      msg('Session error (' + res.status + '). Check SHOPIFY_APP_KEY / SHOPIFY_APP_SECRET env vars match the app credentials, then redeploy.');
    }
  } catch (e) {
    msg('App Bridge error: ' + e.message);
  }
})();
`,
        }}
      />
    </>
  );
}
