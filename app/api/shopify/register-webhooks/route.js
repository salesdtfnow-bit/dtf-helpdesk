import { NextResponse } from 'next/server';
import { shopifyGraphQL } from '../../../../lib/shopify';
import { appUrl } from '../../../../lib/slack';

export const dynamic = 'force-dynamic';

// One-time setup: registers the webhook subscriptions the helpdesk listens for.
// Protect with WEBHOOK_SETUP_SECRET if set:  /api/shopify/register-webhooks?key=...
// Webhooks registered this way are signed with the app's API secret
// (SHOPIFY_APP_SECRET), which the /api/shopify/webhooks handler verifies.
const TOPICS = ['REFUNDS_CREATE', 'FULFILLMENT_ORDERS_PLACED_ON_HOLD'];

export async function GET(req) {
  const url = new URL(req.url);
  const setup = process.env.WEBHOOK_SETUP_SECRET;
  if (setup && url.searchParams.get('key') !== setup) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const callbackUrl = appUrl('/api/shopify/webhooks');
  if (!callbackUrl) {
    return NextResponse.json({ error: 'APP_URL not resolvable' }, { status: 500 });
  }

  const results = [];
  for (const topic of TOPICS) {
    try {
      const { data } = await shopifyGraphQL(
        `mutation ($topic: WebhookSubscriptionTopic!, $url: URL!) {
          webhookSubscriptionCreate(
            topic: $topic
            webhookSubscription: { callbackUrl: $url, format: JSON }
          ) {
            webhookSubscription { id }
            userErrors { field message }
          }
        }`,
        { topic, url: callbackUrl }
      );
      const res = data.webhookSubscriptionCreate;
      results.push({
        topic,
        id: res?.webhookSubscription?.id || null,
        errors: res?.userErrors || [],
      });
    } catch (e) {
      results.push({ topic, error: e.message });
    }
  }
  return NextResponse.json({ callbackUrl, results });
}
