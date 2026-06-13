import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createTicket } from '../../../../lib/tickets';
import { getSql, ensureSchema } from '../../../../lib/db';
import { orderById } from '../../../../lib/shopify';

export const dynamic = 'force-dynamic';

// Shopify signs webhooks with the app's API secret (when created via the Admin
// API / app config) OR with the shop's webhook signing secret (when created
// manually in Settings -> Notifications). Accept either.
function verify(raw, hmac) {
  if (!hmac) return false;
  const secrets = [process.env.SHOPIFY_APP_SECRET, process.env.SHOPIFY_WEBHOOK_SECRET].filter(
    Boolean
  );
  for (const secret of secrets) {
    const digest = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('base64');
    try {
      if (
        digest.length === hmac.length &&
        crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))
      ) {
        return true;
      }
    } catch {
      /* length mismatch -> not a match */
    }
  }
  return false;
}

async function alreadyTicketed(sql, orderNumber, marker) {
  if (!orderNumber) return false;
  const rows = await sql`
    SELECT id FROM tickets
    WHERE order_number = ${orderNumber} AND channel = 'shopify' AND subject LIKE ${marker + '%'}
      AND created_at > now() - interval '7 days' LIMIT 1`;
  return rows.length > 0;
}

function custName(order) {
  if (!order?.customer) return '';
  return `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim();
}

export async function POST(req) {
  const raw = await req.text();
  const hmac = req.headers.get('x-shopify-hmac-sha256');
  if (!verify(raw, hmac)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const topic = req.headers.get('x-shopify-topic') || '';
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  await ensureSchema();
  const sql = getSql();

  try {
    if (topic === 'refunds/create') {
      const orderId = payload.order_id;
      const order = await orderById(orderId);
      const orderName = order?.name || (orderId ? `#${orderId}` : '');
      const email = order?.email || order?.customer?.email || '';
      if (!(await alreadyTicketed(sql, orderName, 'Refund'))) {
        await createTicket({
          subject: `Refund processed on ${orderName || 'an order'}`,
          description: `A refund was created in Shopify for ${orderName || 'an order'}.\nNote: ${payload.note || '—'}`,
          channel: 'shopify',
          category: 'billing',
          customer_name: custName(order),
          customer_email: email,
          order_number: orderName,
        });
      }
    } else if (
      topic === 'fulfillment_orders/placed_on_hold' ||
      topic === 'orders/on_hold'
    ) {
      const orderId =
        payload.order_id || payload.fulfillment_order?.order_id || payload.id;
      const order = await orderById(orderId);
      const orderName = order?.name || (orderId ? `#${orderId}` : '');
      const email = order?.email || order?.customer?.email || '';
      if (!(await alreadyTicketed(sql, orderName, 'Order on hold'))) {
        await createTicket({
          subject: `Order on hold: ${orderName || 'unknown order'}`,
          description: `${orderName || 'An order'} was placed on hold in Shopify and may need attention before it can be fulfilled.`,
          channel: 'shopify',
          category: 'shipping',
          customer_name: custName(order),
          customer_email: email,
          order_number: orderName,
        });
      }
    }
  } catch (e) {
    console.error('Shopify webhook error:', e.message);
  }
  return NextResponse.json({ ok: true });
}
