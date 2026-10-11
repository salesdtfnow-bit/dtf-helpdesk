# DTF Now Helpdesk

Custom ticketing app for DTF Now — tickets from web form, email, Slack and Shopify order context, with Discord notifications (#dtfnow-ticket) and in-app assignment.

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
| `DISCORD_WEBHOOK_URL` | for team notifications | Webhook of the Discord channel (#dtfnow-ticket) |
| `AGENT_DISCORD_IDS` | optional | Extra `Name:DiscordUserId` pairs, comma-separated (the Admin page is the main place) |
| `SHOPIFY_STORE` | for order context | myshopify subdomain, e.g. `d0dc54-ad` |
| `SHOPIFY_ADMIN_TOKEN` | for order context | Admin API token (custom app, `read_orders`) |
| `APP_URL` | optional | Public base URL used in notification links |
| `INBOUND_SECRET` | optional | Protects `/api/inbound-email` |
| `INTAKE_SECRET` | optional | Protects `/api/tickets` |
| `SLACK_SLASH_TOKEN` | optional | Verifies Slack slash command requests |

## Intake endpoints

- `POST /api/tickets` — JSON `{subject, description, customer_email, ...}`
- `POST /api/inbound-email?secret=...` — SendGrid Inbound Parse or JSON `{from, subject, text}`. Auto-categorises (reprint, print quality, shipping…) and extracts order numbers.
- `POST /api/slack` — Slack slash command (`/newticket ...`)

## Discord setup (notifications)

New tickets, assignments, status changes and reprints are posted to Discord.

1. In Discord, open #dtfnow-ticket → Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL.
2. Put it in `DISCORD_WEBHOOK_URL` (Vercel → Settings → Environment Variables) and redeploy.
3. For @mentions, add each person's Discord user ID on the Admin page (Discord: Settings → Advanced → Developer Mode on, then right-click the person → Copy User ID).

Slack notifications were removed in Oct 2026; `SLACK_WEBHOOK_URL` is no longer used. The `/api/slack` slash command still works if it's set up.

## Shopify setup (order context)

1. Shopify admin → Settings → Apps and sales channels → Develop apps → Create app.
2. Configure Admin API scopes: `read_orders`, `read_customers`. Install app.
3. Copy the Admin API access token into `SHOPIFY_ADMIN_TOKEN`; set `SHOPIFY_STORE` to your myshopify subdomain.

## Email-to-ticket

Point an inbound-email service at `/api/inbound-email`:
- SendGrid Inbound Parse (free tier works): add MX record for a subdomain (e.g. `tickets.dtfnow.co.uk`) → forward `support@dtfnow.co.uk` to `anything@tickets.dtfnow.co.uk`.
- Or any service that can POST JSON `{from, subject, text}`.
