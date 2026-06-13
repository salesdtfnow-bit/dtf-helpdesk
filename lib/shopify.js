// Shopify Admin API lookups.
// Credentials come from (in order of preference):
//   1. The offline access token stored in the DB by the embedded app's token
//      exchange (open the app once inside Shopify admin to populate it).
//   2. SHOPIFY_STORE + SHOPIFY_ADMIN_TOKEN env vars (manual custom-app token).
import { getSql, ensureSchema, hasDb } from './db';

const API_VERSION = '2025-01';

function envStoreHost() {
  let s = (process.env.SHOPIFY_STORE || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  if (s && !s.includes('.')) s += '.myshopify.com';
  return s;
}

async function creds() {
  if (hasDb()) {
    try {
      await ensureSchema();
      const sql = getSql();
      const rows = await sql`
        SELECT shop, token FROM shop_tokens ORDER BY updated_at DESC LIMIT 1`;
      if (rows.length) return { host: rows[0].shop, token: rows[0].token };
    } catch (e) {
      console.error('shop_tokens lookup failed:', e.message);
    }
  }
  const host = envStoreHost();
  const token = process.env.SHOPIFY_ADMIN_TOKEN || '';
  return host && token ? { host, token } : null;
}

export async function shopifyConfigured() {
  return !!(await creds());
}

export async function shopifyHost() {
  const c = await creds();
  return c ? c.host : null;
}

async function adminQuery(query, variables = {}) {
  const c = await creds();
  if (!c) throw new Error('Shopify not configured');
  const res = await fetch(`https://${c.host}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': c.token,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Shopify API ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return { data: json.data, host: c.host };
}

// Exposed for webhook registration and other admin mutations.
export async function shopifyGraphQL(query, variables = {}) {
  return adminQuery(query, variables);
}

export async function recentOrdersByEmail(email) {
  if (!email || !(await shopifyConfigured())) return null;
  try {
    const { data, host } = await adminQuery(
      `query ($q: String!) {
        orders(first: 5, query: $q, sortKey: CREATED_AT, reverse: true) {
          nodes {
            name
            legacyResourceId
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            lineItems(first: 5) { nodes { title quantity } }
          }
        }
      }`,
      { q: `email:${email}` }
    );
    const handle = host.replace('.myshopify.com', '');
    return data.orders.nodes.map((o) => ({
      ...o,
      adminUrl: `https://admin.shopify.com/store/${handle}/orders/${o.legacyResourceId}`,
    }));
  } catch (e) {
    console.error('Shopify lookup failed:', e.message);
    return null;
  }
}

// Look up a single order by its numeric (legacy) id — used to enrich webhooks.
export async function orderById(legacyId) {
  if (!legacyId || !(await shopifyConfigured())) return null;
  try {
    const { data } = await adminQuery(
      `query ($id: ID!) {
        order(id: $id) {
          name
          email
          displayFinancialStatus
          displayFulfillmentStatus
          customer { firstName lastName email }
        }
      }`,
      { id: `gid://shopify/Order/${legacyId}` }
    );
    return data.order || null;
  } catch (e) {
    console.error('Shopify orderById failed:', e.message);
    return null;
  }
}

export async function customerByEmail(email) {
  if (!email || !(await shopifyConfigured())) return null;
  try {
    const { data } = await adminQuery(
      `query ($q: String!) {
        customers(first: 1, query: $q) {
          nodes {
            firstName
            lastName
            email
            phone
            numberOfOrders
            amountSpent { amount currencyCode }
            createdAt
          }
        }
      }`,
      { q: `email:${email}` }
    );
    return data.customers.nodes[0] || null;
  } catch (e) {
    console.error('Shopify customer lookup failed:', e.message);
    return null;
  }
}
