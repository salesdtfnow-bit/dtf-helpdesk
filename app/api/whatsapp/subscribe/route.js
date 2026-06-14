import { NextResponse } from 'next/server';

// Setup + diagnostic: subscribes this app to the WhatsApp Business Account and
// reports the phone number's Cloud API status (to detect a consumer-app
// conflict, where the number is still registered on the WhatsApp app and
// intercepts inbound messages before they reach the Cloud API webhook).
const GRAPH = `https://graph.facebook.com/${process.env.WA_GRAPH_VERSION || 'v21.0'}`;
const WABA = process.env.WHATSAPP_WABA_ID || '1545063060789460';
const PHONE = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'WHATSAPP_TOKEN not set' }, { status: 400 });
  }
  const auth = { Authorization: `Bearer ${token}` };
  const out = { waba: WABA, phoneNumberId: PHONE };

  try {
    const sub = await fetch(`${GRAPH}/${WABA}/subscribed_apps`, { method: 'POST', headers: auth });
    out.subscribeStatus = sub.status;
    out.subscribe = await sub.json().catch(() => ({}));
  } catch (e) {
    out.subscribeError = e.message;
  }

  if (PHONE) {
    try {
      const fields =
        'display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,status,name_status,throughput';
      const res = await fetch(`${GRAPH}/${PHONE}?fields=${fields}`, { headers: auth });
      out.phoneStatus = res.status;
      out.phone = await res.json().catch(() => ({}));
    } catch (e) {
      out.phoneError = e.message;
    }
  }

  return NextResponse.json(out);
}
