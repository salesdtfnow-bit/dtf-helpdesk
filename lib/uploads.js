// Relays customer artwork to the Files Uploader app (missing-files-uploader.onrender.com),
// which verifies the order, stores files in Google Drive and tags the Shopify order.
export function uploadsConfigured() {
  return !!process.env.UPLOAD_APP_URL;
}

// Public upload page customers are sent to (the helpdesk must not carry big files itself —
// Vercel caps serverless request bodies at ~4.5 MB).
export function uploadPageUrl() {
  const baseUrl = (process.env.UPLOAD_APP_URL || '').replace(/\/$/, '');
  if (!baseUrl) return '';
  const shop = process.env.UPLOAD_SHOP || 'd0dc54-ad.myshopify.com';
  return `${baseUrl}/upload/${shop}`;
}

export async function relayFilesToUploader({ name, email, orderNumber, files }) {
  const baseUrl = (process.env.UPLOAD_APP_URL || '').replace(/\/$/, '');
  const shop = process.env.UPLOAD_SHOP || 'd0dc54-ad.myshopify.com';
  const fd = new FormData();
  fd.set('uploadType', 'normal');
  fd.set('fullName', name || 'Customer');
  fd.set('email', email || '');
  fd.set('orderNumber', (orderNumber || '').replace(/^#/, '').trim());
  fd.set('consent', 'yes');
  for (const f of files) fd.append('file', f, f.name);
  try {
    const res = await fetch(`${baseUrl}/upload/${shop}`, { method: 'POST', body: fd });
    const json = await res.json().catch(() => null);
    return { ok: !!(res.ok && json?.ok), ...(json || {}) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Reads back what a customer already uploaded on the Files Uploader.
// Returns [] when there is nothing, and null when the uploader can't be reached
// or isn't configured — never throws.
export async function customerFiles({ orderNumber, email }) {
  const baseUrl = (process.env.UPLOAD_APP_URL || '').replace(/\/$/, '');
  const key = process.env.UPLOAD_API_KEY;
  if (!baseUrl || !key) return null;
  const order = String(orderNumber || '').replace(/^#/, '').trim();
  const mail = String(email || '').trim();
  const query = order
    ? `orderNumber=${encodeURIComponent(order)}`
    : mail
    ? `email=${encodeURIComponent(mail)}`
    : '';
  if (!query) return [];
  try {
    const res = await fetch(`${baseUrl}/api/submissions?${query}`, {
      headers: { 'x-api-key': key },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('Files Uploader lookup failed:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const json = await res.json().catch(() => null);
    if (!Array.isArray(json?.submissions)) {
      console.error('Files Uploader lookup returned an unexpected payload.');
      return null;
    }
    return json.submissions;
  } catch (e) {
    console.error('Files Uploader lookup failed:', e.message);
    return null;
  }
}
