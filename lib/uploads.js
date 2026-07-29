// Integration with the Files Uploader app (missing-files-uploader.onrender.com).
//
// Files are NOT proxied through the helpdesk: Vercel caps serverless request
// bodies at ~4.5 MB and DTF artwork is routinely far larger. Customers upload
// directly to the uploader (50 MB/file, verifies the order, stores in Google
// Drive, tags the Shopify order); the helpdesk reads back what they sent.

function base() {
  return (process.env.UPLOAD_APP_URL || '').replace(/\/$/, '');
}

export function uploadShop() {
  return process.env.UPLOAD_SHOP || 'd0dc54-ad.myshopify.com';
}

// Public page customers use to send artwork.
export function uploadPageUrl() {
  return base() ? `${base()}/upload/${uploadShop()}` : '';
}

export function uploadsConfigured() {
  return !!(base() && process.env.UPLOAD_API_KEY);
}

// Files already uploaded for an order / customer.
export async function customerFiles({ orderNumber, email }) {
  if (!uploadsConfigured()) return null;
  const params = new URLSearchParams();
  if (orderNumber) params.set('orderNumber', String(orderNumber).replace(/^#/, '').trim());
  else if (email) params.set('email', email);
  else return null;

  try {
    const res = await fetch(`${base()}/api/submissions?${params.toString()}`, {
      headers: { 'x-api-key': process.env.UPLOAD_API_KEY },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('Uploader submissions failed:', res.status);
      return null;
    }
    const json = await res.json();
    return json.submissions || [];
  } catch (e) {
    console.error('Uploader submissions failed:', e.message);
    return null;
  }
}
