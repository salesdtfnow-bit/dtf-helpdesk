import { NextResponse } from 'next/server';

// Completes Cloud API registration for the business phone number. Required to
// move the number from PENDING/NOT_APPLICABLE to CONNECTED/CLOUD_API so inbound
// messages route to the webhook. Sets a two-step-verification PIN.
// Open once:  /api/whatsapp/register?pin=247816
const GRAPH = `https://graph.facebook.com/${process.env.WA_GRAPH_VERSION || 'v21.0'}`;
const PHONE = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token || !PHONE) {
    return NextResponse.json({ error: 'missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID' }, { status: 400 });
  }
  const url = new URL(req.url);
  const pin = url.searchParams.get('pin') || '247816';
  try {
    const res = await fetch(`${GRAPH}/${PHONE}/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ status: res.status, pin, data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
