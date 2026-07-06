# ShiftLog — Shopify App

> Internal operations log for Shopify store teams. Staff submit shift notes, annotate orders and customers, track suppliers, and owners get a daily digest. Everything in one place instead of scattered across WhatsApp.

---

## What's built

| Feature | Route / File |
|---|---|
| Dashboard | `app/routes/app._index.tsx` |
| Shift Notes | `app/routes/app.shifts.tsx` |
| Pending Items inbox | `app/routes/app.pending.tsx` |
| Order annotations list | `app/routes/app.orders.tsx` |
| Customer notes list | `app/routes/app.customers.tsx` |
| Supplier directory | `app/routes/app.suppliers.tsx` |
| Supplier note threads | `app/routes/app.suppliers.$id.tsx` |
| Audit trail | `app/routes/app.audit.tsx` |
| Search (Team+) | `app/routes/app.search.tsx` |
| Team management | `app/routes/app.team.tsx` |
| Staff invite | `app/routes/app.team.invite.tsx` |
| Invite acceptance | `app/routes/invite.$token.tsx` |
| Settings | `app/routes/app.settings._index.tsx` |
| Billing / Plans | `app/routes/app.settings.billing.tsx` |
| Webhooks | `app/routes/webhooks.tsx` |
| GDPR webhooks | `app/routes/webhooks.gdpr.tsx` |
| Daily digest cron | `app/routes/api.digest.tsx` |
| Order notes API | `app/routes/api.order-annotations.tsx` |
| Customer notes API | `app/routes/api.customer-notes.tsx` |
| Order UI Extension | `extensions/order-annotations/src/OrderNotes.tsx` |
| Customer UI Extension | `extensions/customer-notes/src/CustomerNotes.tsx` |
| Daily digest job | `app/jobs/dailyDigest.server.ts` |

---

## Prerequisites

- Node.js 20+
- A [Shopify Partner account](https://partners.shopify.com) (free)
- A development store
- [Shopify CLI 3](https://shopify.dev/docs/api/shopify-cli): `npm install -g @shopify/cli`
- PostgreSQL database (use [Supabase free tier](https://supabase.com))
- [Resend](https://resend.com) account for email (free tier: 3,000 emails/month)

---

## Local Development

### 1. Clone and install

```bash
cd shiftlog
npm install
```

### 2. Create your Shopify app

```bash
shopify app create
```

Follow the prompts. This creates a `shopify.app.toml` with your `client_id`.

### 3. Set up environment

```bash
cp .env.example .env
```

Fill in:
- `SHOPIFY_API_KEY` — from your Partner dashboard
- `SHOPIFY_API_SECRET` — from your Partner dashboard
- `DATABASE_URL` — your Postgres connection string
- `RESEND_API_KEY` — from resend.com
- `CRON_SECRET` — generate with: `openssl rand -hex 32`

### 4. Set up the database

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Start development

```bash
shopify app dev
```

This starts the Remix server, creates an ngrok tunnel, and registers webhooks automatically.

---

## Deployment to Fly.io

### 1. Install Fly CLI

```bash
brew install flyctl     # macOS
# or
curl -L https://fly.io/install.sh | sh
```

### 2. Create the app

```bash
flyctl launch --name shiftlog
```

### 3. Set secrets

```bash
flyctl secrets set \
  SHOPIFY_API_KEY="your_key" \
  SHOPIFY_API_SECRET="your_secret" \
  DATABASE_URL="postgresql://..." \
  RESEND_API_KEY="re_..." \
  CRON_SECRET="your_random_secret" \
  SHOPIFY_APP_URL="https://shiftlog.fly.dev"
```

### 4. Deploy

```bash
flyctl deploy
```

### 5. Update your Shopify app URLs

In your Shopify Partner dashboard:
- App URL: `https://shiftlog.fly.dev`
- Allowed redirect URLs: `https://shiftlog.fly.dev/auth/callback`

In `shopify.app.toml`, update `application_url` and `redirect_urls`.

### 6. Deploy extensions

```bash
shopify app deploy
```

### 7. Set up the cron job

**Option A — GitHub Actions** (free):
1. Add `APP_URL` and `CRON_SECRET` to your GitHub repo secrets
2. The `.github/workflows/digest-cron.yml` runs every hour automatically

**Option B — cron-job.org** (free):
1. Create account at cron-job.org
2. Add a job: `POST https://shiftlog.fly.dev/api/digest` every hour
3. Add header: `Authorization: Bearer YOUR_CRON_SECRET`

**Option C — Fly.io machines** (simplest):
Add to `fly.toml` and use `fly machines run` for a scheduled task.

---

## Shopify App Store Submission

### Required before submitting:

1. **Privacy policy** at `https://shiftlog.app/privacy`
2. **Terms of service** at `https://shiftlog.app/terms`
3. **App icon** (1200×628px) — upload in Partner dashboard
4. **Screenshots** — 5 screenshots of the main features
5. **GDPR webhooks** — ✅ already implemented (`/webhooks/gdpr`)
6. **Test on a real store** — install, create notes, check digest

### Shopify review checklist:

- ✅ App uses Shopify Billing API (no external payment)
- ✅ GDPR webhooks implemented
- ✅ App is embedded (uses App Bridge)
- ✅ OAuth is correct (uses `shopify-app-remix`)
- ✅ Webhooks are verified (handled by `authenticate.webhook`)
- ✅ App handles `APP_UNINSTALLED` webhook
- ✅ Scopes are minimal and justified

### Submit:

1. Go to Partner dashboard → Apps → ShiftLog → Distribution
2. Click "Submit app"
3. Fill in listing details, screenshots, description
4. Expected review time: 3–7 business days

---

## Plans & Pricing

| Plan | Price | Staff | Features |
|---|---|---|---|
| Trial | Free (14 days) | 2 | All features |
| Solo | $19/month | 2 | Core features |
| Team | $49/month | 6 | + Audit, Search, Templates |
| Agency | $129/month | Unlimited | + Multi-store, Slack, WhatsApp, CSV |

Annual plans available at ~17% discount.

---

## Architecture

```
Shopify Admin
    │
    ├── Embedded App (Remix + Polaris)
    │       ├── Dashboard
    │       ├── Shift Notes
    │       ├── Pending Items
    │       ├── Suppliers
    │       ├── Audit Trail
    │       └── Settings/Billing
    │
    ├── UI Extensions (Admin blocks)
    │       ├── Order Notes panel (order detail page)
    │       └── Customer Notes panel (customer detail page)
    │
    └── Webhooks
            ├── orders/updated → Audit log
            ├── refunds/create → Audit log
            ├── products/update → Audit log
            ├── app/uninstalled → Mark inactive
            └── GDPR webhooks

External:
    ├── PostgreSQL (Supabase) — data storage
    ├── Resend — transactional email
    └── Cron (GitHub Actions / cron-job.org) → /api/digest hourly
```

---

## Support

- Email: support@shiftlog.app
- Docs: https://shiftlog.app/docs
