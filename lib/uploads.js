// Relays customer artwork to the Files Uploader app (missing-files-uploader.onrender.com),
// which verifies the order, stores files in Google Drive and tags the Shopify order.
export function uploadsConfigured() {
  return !!process.env.UPLOAD_APP_URL;
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
