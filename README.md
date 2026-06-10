# DTF Now Helpdesk

Custom ticketing app for DTF Now — tickets from web form, email, Slack and Shopify order context, with Slack notifications and in-app assignment.

## Pages

- `/tickets` — agent dashboard (ticket list, filters). Basic-auth protected.
- `/tickets/[id]` — ticket detail: conversation, internal notes, assignment, status, customer's recent Shopify orders.
- `/tickets/new` — create ticket manually.
- `/support` — public customer contact form.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection (add Neon via Vercel → Storage) |
| `ADMIN_PASSWORD` | recommended | Protects agent area (user: `admin` or `ADMIN_USER`) |
| `AGENTS` | recommended | Comma-separated agent names, e.g. `Vitaly,Sam` |
| `SLACK_WEBHOOK_URL` | for Slack notifications | Incoming webhook for your channel |
| `SHOPIFY_STORE` | for order context | myshopify subdomain, e.g. `d0dc54-ad` |
| `SHOPIFY_ADMIN_TOKEN` | for order context | Admin API token (custom app, `read_orders`) |
| `APP_URL` | optional | Public base URL used in Slack links |
| `INBOUND_SECRET` | optional | Protects `/api/inbound-email` |
| `INTAKE_SECRET` | optional | Protects `/api/tickets` |
| `SLACK_SLASH_TOKEN` | optional | Verifies Slack slash command requests |

## Intake endpoints

- `POST /api/tickets` — JSON `{subject, description, customer_email, ...}`
- `POST /api/inbound-email?secret=...` — SendGrid Inbound Parse or JSON `{from, subject, text}`. Auto-categorises (reprint, print quality, shipping…) and extracts order numbers.
- `POST /api/slack` — Slack slash command (`/newticket ...`)

## Slack setup (notifications)

1. Open https://api.slack.com/apps → Create App → From scratch.
2. Incoming Webhooks → activate → Add New Webhook → pick your channel (e.g. #help-desk-support).
3. Copy the webhook URL into `SLACK_WEBHOOK_URL`.

## Shopify setup (order context)

1. Shopify admin → Settings → Apps and sales channels → Develop apps → Create app.
2. Configure Admin API scopes: `read_orders`, `read_customers`. Install app.
3. Copy the Admin API access token into `SHOPIFY_ADMIN_TOKEN`; set `SHOPIFY_STORE` to your myshopify subdomain.

## Email-to-ticket

Point an inbound-email service at `/api/inbound-email`:
- SendGrid Inbound Parse (free tier works): add MX record for a subdomain (e.g. `tickets.dtfnow.co.uk`) → forward `support@dtfnow.co.uk` to `anything@tickets.dtfnow.co.uk`.
- Or any service that can POST JSON `{from, subject, text}`.
