import { NextResponse } from 'next/server';

// One-time setup + diagnostic: subscribes this app to the WhatsApp Business
// Account so real inbound message webhooks are delivered (separate from the
// app's webhook field config). Open this URL once after going live.
const GRAPH = `https://graph.facebook.com/${process.env.WA_GRAPH_VERSION || 'v21.0'}`;
const WABA = process.env.WHATSAPP_WABA_ID || '1545063060789460';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'WHATSAPP_TOKEN not set' }, { status: 400 });
  }
  const auth = { Authorization: `Bearer ${token}` };
  const out = { waba: WABA };

  try {
    const before = await fetch(`${GRAPH}/${WABA}/subscribed_apps`, { headers: auth });
    out.before = await before.json().catch(() => ({}));
  } catch (e) {
    out.beforeError = e.message;
  }

  try {
    const sub = await fetch(`${GRAPH}/${WABA}/subscribed_apps`, { method: 'POST', headers: auth });
    out.subscribeStatus = sub.status;
    out.subscribe = await sub.json().catch(() => ({}));
  } catch (e) {
    out.subscribeError = e.message;
  }

  try {
    const after = await fetch(`${GRAPH}/${WABA}/subscribed_apps`, { headers: auth });
    out.after = await after.json().catch(() => ({}));
  } catch (e) {
    out.afterError = e.message;
  }

  return NextResponse.json(out);
}
