# China Supply Radar Shopify App

China Supply Radar Shopify App is the primary commercial product in the
China Supply Radar P0 product line. It helps Shopify merchants manage supplier
mapping, order scanning, inventory coverage days, replenishment recommendations,
China holiday risk, and procurement planning.

This directory is intentionally separate from the Chrome extension code.

## Product Line

- Product line: `China Supply Radar`
- Surface: `Shopify App`
- Priority: `P0 primary product`
- Related surfaces: `China Supply Radar Chrome Extension` and `China Supply Radar Growth Engine`
- Boundary: this is the main commercialization product, not an experiment or a separate SaaS.

## Current Status

This is the current V1 implementation track:

- Vite + React + TypeScript app shell
- Shopify Polaris UI
- Dashboard, Products, Suppliers, Holiday Calendar, Settings views
- Reorder calculation engine with tests
- Prisma data model for shops, suppliers, variant snapshots, mappings, sales velocity, holidays, recommendations, and app events
- Shopify GraphQL Admin API query stubs
- Shopify app TOML placeholder
- Lightweight OAuth/session/webhook backend starter using Node built-ins
- HMAC verification for OAuth callbacks and webhooks
- AES-256-GCM access token encryption helper
- Prisma-backed session store with encrypted token persistence
- Shopify Admin GraphQL client with stable error mapping
- Product and inventory sync service writing `VariantSnapshot`
- API routes for shop status, cached products, and product sync
- Orders sync service writing real `SalesVelocity`
- Recommendation generation from real sales velocity when available

Local SQLite migration is in place. Shopify CLI binding and real Partner/dev
store credentials are still required before a real OAuth install can complete.

## Local Setup

```bash
nvm use
npm install
npm run server
npm run dev
```

Open `http://localhost:5174`. The Vite dev server proxies `/api`, `/auth`, and
`/webhooks` to `http://localhost:3001`.

This project pins Node 22 through `.nvmrc` and uses npm with
`package-lock.json`. On this local machine, full dependency installation still
stalled during the final linking/write phase; `npm install --package-lock-only`
does complete under Node `v22.22.3` / npm `10.9.8`.

## Recommended Dev Setup: Docker

Local npm installs may stall on this machine during the final linking/write
phase. Use Docker for dependency installation, Prisma generation, tests,
typechecking, and production builds.

```bash
npm run docker:build
npm run docker:prisma
npm run docker:migrate
npm run docker:test
npm run docker:typecheck
npm run docker:build-app
```

Open an interactive container shell:

```bash
npm run docker:shell
```

Run the backend and Vite dev server from separate container shells:

```bash
npm run server
npm run dev -- --host 0.0.0.0 --port 5174
```

The compose setup mounts the project at `/app` and keeps container
`node_modules` in a named Docker volume so the incomplete host install cannot
overwrite container dependencies.

For real Shopify OAuth testing, expose only the backend port through your
tunnel:

```bash
cloudflared tunnel --url http://localhost:3001
# or
ngrok http 3001
```

Keep the frontend on `http://localhost:5174`; Vite proxies `/api`, `/auth`, and
`/webhooks` to the backend on `http://localhost:3001`.

## Tests

```bash
npm test
```

The test suite currently covers:

- Reorder date and risk calculations
- Shopify OAuth query HMAC verification
- Shopify webhook HMAC verification
- Access token encryption/decryption
- OAuth callback state validation and session write
- `app/uninstalled` webhook handling
- PrismaSessionStore save/load/delete/markUninstalled
- Shopify GraphQL client not-installed, unauthorized, and throttled errors
- Product sync service with mocked Shopify GraphQL data
- API route authorization and sync responses

## Backend Starter

The backend entrypoint is intentionally dependency-light:

```bash
npm run server
```

Routes:

- `GET /auth?shop=<shop>.myshopify.com`
- `GET /auth/callback`
- `POST /webhooks/app/uninstalled`
- `GET /api/shop?shop=<shop>.myshopify.com`
- `GET /api/products?shop=<shop>.myshopify.com`
- `POST /api/sync/products?shop=<shop>.myshopify.com`
- `POST /api/sync/orders?shop=<shop>.myshopify.com&windowDays=30`
- `GET /api/sales-velocity?shop=<shop>.myshopify.com`

The default server store is Prisma-backed. Use `SESSION_STORE=memory` only for
local smoke tests without Prisma dependencies.

## Build

```bash
npm run build
```

## Environment

Copy `.env.example` and fill values after creating a Shopify Partner app.

```bash
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_SCOPES=read_products,read_inventory,read_orders
SHOPIFY_APP_URL=REQUIRES_PUBLIC_HTTPS_APP_URL
SESSION_ENCRYPTION_KEY=replace-with-at-least-32-random-characters
DATABASE_URL="file:./dev.db"
SESSION_STORE=prisma
```

For local development this repo uses:

```bash
DATABASE_URL="file:./dev.db"
```

Generate a local session encryption key with:

```bash
openssl rand -base64 32
```

`SESSION_ENCRYPTION_KEY` must be at least 32 characters long. Access tokens are
encrypted before they are written to `ShopSession.accessTokenEncrypted`.

## Prisma

Generate the client after dependencies are fully installed:

```bash
npx prisma generate
```

Apply the local SQLite migration:

```bash
npx prisma migrate dev
```

The migration already created in this repo is:

```text
prisma/migrations/20260613021727_init/migration.sql
```

Seed a mock installed shop session:

```bash
SEED_SHOP=your-store.myshopify.com SEED_ACCESS_TOKEN=shpat_xxx npm run db:seed
```

## Shopify Partner App Settings

For a local tunnel such as `https://your-tunnel.example.com`, configure:

- App URL: `https://your-tunnel.example.com`
- Allowed redirection URL: `https://your-tunnel.example.com/auth/callback`
- App proxy/webhook target for uninstall: `https://your-tunnel.example.com/webhooks/app/uninstalled`
- Scopes: `read_products,read_inventory,read_orders`

Then set:

```bash
SHOPIFY_API_KEY=<Partner app client id>
SHOPIFY_API_SECRET=<Partner app client secret>
SHOPIFY_APP_URL=https://your-tunnel.example.com
SHOPIFY_SCOPES=read_products,read_inventory,read_orders
SESSION_ENCRYPTION_KEY=<output from openssl rand -base64 32>
DATABASE_URL="file:./dev.db"
SESSION_STORE=prisma
```

Start OAuth with:

```bash
https://your-tunnel.example.com/auth?shop=<test-shop>.myshopify.com
```

After authorizing, verify the installed shop session:

For the real order to sales velocity verification flow, see
[`docs/local-order-sales-velocity-verification.md`](docs/local-order-sales-velocity-verification.md).

```bash
curl "https://your-tunnel.example.com/api/shop?shop=<test-shop>.myshopify.com"
```

Sync products from the installed test shop:

```bash
curl -X POST "https://your-tunnel.example.com/api/sync/products?shop=<test-shop>.myshopify.com"
curl "https://your-tunnel.example.com/api/products?shop=<test-shop>.myshopify.com"
```

Expected sync response shape:

```json
{
  "syncedCount": 0,
  "skippedCount": 0,
  "errorCount": 0,
  "lastSyncedAt": "2026-06-13T00:00:00.000Z"
}
```

## Shopify App Boundary

V1 should remain:

- Embedded in Shopify Admin
- GraphQL Admin API first
- Minimal scopes for V1 risk calculation: `read_products`, `read_inventory`, and `read_orders`
- Read-only inventory/reorder intelligence until a write workflow is justified
- Independent from the Chrome extension

The Chrome extension can be promoted as an optional companion, but the Shopify
app must work without requiring a browser extension.

## Screenshot Mode

Use screenshot mode for Shopify App Listing screenshots:

```text
http://localhost:5174/?shop=<test-shop>.myshopify.com&demoMode=1
```

Screenshot mode only adjusts the Dashboard presentation. It does not create
fake products, orders, sales velocity, recommendations, or reorder queue items.

## V1 Pre-Submission Status

Current submission strategy: Free Beta / Free MVP.

Current pricing: Free beta.

No charges are made through Shopify at this time. Future paid plans may be introduced later with advance notice.

Code status:

- `npm run build` passes locally.
- `npm test` passes locally.
- OAuth, HMAC verification, encrypted sessions, product sync, order sync, sales velocity, supplier mapping, recommendations, and reorder queue code exists.
- App Bridge CDN and frontend session-token attachment are implemented.

Still required before Shopify review:

- REQUIRES PRODUCTION CONFIG: real HTTPS production URL.
- REQUIRES PRODUCTION CONFIG: Partner Dashboard app URL, redirect URL, client ID, and webhook URLs.
- REQUIRES PRODUCTION CONFIG: public Privacy Policy and Terms URLs.
- TODO: Protected Customer Data request for `read_orders`.
- TODO: real Shopify test store install and embedded-app QA.
- TODO: app icon, screenshots, banner, and review walkthrough/demo.
- TODO: production database and migrations.

## GDPR And Data Protection

China Supply Radar includes GDPR webhook handlers, but production webhook delivery still needs to be verified before submission:

1. **GDPR Webhooks Implemented**:
   - `CUSTOMERS_DATA_REQUEST`: No-op (we do not store customer personal data)
   - `CUSTOMERS_REDACT`: No-op (we do not store customer personal data)
   - `SHOP_REDACT`: Deletes all shop-specific session and access token data

2. **Data Policy**:
   - We do not store any personal customer information (names, emails, addresses, etc.)
   - All shop data is deleted upon request via SHOP_REDACT webhook
   - Anonymized aggregate statistics are retained for product improvement

3. **Documentation**:
   - Full GDPR webhook implementation details: [docs/gdpr-webhooks.md](docs/gdpr-webhooks.md)
   - Protected customer data explanation: [docs/protected-customer-data.md](docs/protected-customer-data.md)
   - Privacy Policy URL: REQUIRES PRODUCTION CONFIG
   - Terms of Service URL: REQUIRES PRODUCTION CONFIG
