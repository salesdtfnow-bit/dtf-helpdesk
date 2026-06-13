// Meta WhatsApp Cloud API helpers.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
const GRAPH = `https://graph.facebook.com/${process.env.WA_GRAPH_VERSION || 'v21.0'}`;

export function whatsappConfigured() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

// Send a free-form text message. Only deliverable inside the 24h customer
// service window; outside it WhatsApp requires an approved template.
export async function sendWhatsAppText(toWaId, body) {
  if (!whatsappConfigured()) return { ok: false, error: 'WhatsApp not configured' };
  const url = `${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toWaId,
        type: 'text',
        text: { preview_url: true, body: String(body).slice(0, 4096) },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
    return { ok: true, id: data?.messages?.[0]?.id || '' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Send an approved template (used to re-open a conversation outside 24h).
export async function sendWhatsAppTemplate(toWaId, templateName, languageCode = 'en_GB', components = []) {
  if (!whatsappConfigured()) return { ok: false, error: 'WhatsApp not configured' };
  const url = `${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toWaId,
        type: 'template',
        template: { name: templateName, language: { code: languageCode }, components },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
    return { ok: true, id: data?.messages?.[0]?.id || '' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Verify Meta webhook payload signature (X-Hub-Signature-256). No-op if no app secret set.
export function verifyWhatsAppSignature(rawBody, signatureHeader) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!signatureHeader) return false;
  try {
    const crypto = require('crypto');
    const expected =
      'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}
