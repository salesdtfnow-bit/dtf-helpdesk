import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { EMBED_COOKIE, verifyEmbedCookieValue } from '../../lib/embed';

export const dynamic = 'force-dynamic';

// Entry point for the embedded Shopify admin app.
// If we already have a valid embed session → straight to the helpdesk.
// Otherwise → kick off the OAuth install/grant flow for this shop.
export default async function ShopifyEntry({ searchParams }) {
  const cookie = cookies().get(EMBED_COOKIE)?.value;
  if (cookie && (await verifyEmbedCookieValue(cookie))) {
    redirect('/tickets');
  }

  const shop = searchParams?.shop;
  if (shop && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    redirect(`/api/shopify/auth?shop=${encodeURIComponent(shop)}`);
  }

  return (
    <div className="card" style={{ maxWidth: 560, margin: '40px auto' }}>
      <h1>DTF Now Helpdesk</h1>
      <p className="muted">
        This page is the entry point for the embedded Shopify admin app. Open it from your Shopify
        admin (Apps → DTF Helpdesk), or append <code>?shop=your-store.myshopify.com</code> to
        install.
      </p>
    </div>
  );
}
