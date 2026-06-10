// Shopify Admin API lookups. Requires:
//   SHOPIFY_STORE = your myshopify subdomain or full domain, e.g. "d0dc54-ad" or "d0dc54-ad.myshopify.com"
//   SHOPIFY_ADMIN_TOKEN = Admin API access token (custom app, read_orders + read_customers)
const API_VERSION = '2025-01';

function storeHost() {
  let s = (process.env.SHOPIFY_STORE || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  if (s && !s.includes('.')) s += '.myshopify.com';
  return s;
}

export function shopifyConfigured() {
  return !!(storeHost() && process.env.SHOPIFY_ADMIN_TOKEN);
}

async function adminQuery(query, variables = {}) {
  const res = await fetch(`https://${storeHost()}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Shopify API ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

export async function recentOrdersByEmail(email) {
  if (!shopifyConfigured() || !email) return null;
  try {
    const data = await adminQuery(
      `query ($q: String!) {
        orders(first: 5, query: $q, sortKey: CREATED_AT, reverse: true) {
          nodes {
            name
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
    return data.orders.nodes;
  } catch (e) {
    console.error('Shopify lookup failed:', e.message);
    return null;
  }
}

export async function customerByEmail(email) {
  if (!shopifyConfigured() || !email) return null;
  try {
    const data = await adminQuery(
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
