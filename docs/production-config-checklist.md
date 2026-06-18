# Production Configuration Checklist

Last updated: June 18, 2026

Status: REQUIRES PRODUCTION CONFIG.

Do not submit the app for Shopify review until every production item below is filled with real values and verified.

## Required Environment Variables

| Variable | Purpose | Status |
|---|---|---|
| `SHOPIFY_API_KEY` | Partner Dashboard app client ID | REQUIRES PRODUCTION CONFIG |
| `SHOPIFY_API_SECRET` | Partner Dashboard app client secret | REQUIRES PRODUCTION CONFIG |
| `SHOPIFY_APP_URL` | Public production HTTPS app URL, no trailing slash | REQUIRES PRODUCTION CONFIG |
| `SHOPIFY_SCOPES` | `read_products,read_inventory,read_orders` | PARTIAL |
| `SESSION_ENCRYPTION_KEY` | 32+ character secret for token encryption | REQUIRES PRODUCTION CONFIG |
| `DATABASE_URL` | Production database connection string | REQUIRES PRODUCTION CONFIG |
| `SESSION_STORE` | `prisma` in production | REQUIRES PRODUCTION CONFIG |

## Partner Dashboard Fields To Fill Manually

- App URL: REQUIRES PRODUCTION CONFIG
- Allowed redirection URL: REQUIRES PRODUCTION CONFIG, expected path `/auth/callback`
- App uninstalled webhook URL: REQUIRES PRODUCTION CONFIG, expected path `/webhooks/app/uninstalled`
- Customers data request webhook URL: REQUIRES PRODUCTION CONFIG, expected path `/webhooks/gdpr/customers_data_request`
- Customers redact webhook URL: REQUIRES PRODUCTION CONFIG, expected path `/webhooks/gdpr/customers_redact`
- Shop redact webhook URL: REQUIRES PRODUCTION CONFIG, expected path `/webhooks/gdpr/shop_redact`
- Protected Customer Data request for `read_orders`: TODO
- Emergency developer contact: TODO
- Review test store/access: TODO

## `shopify.app.toml`

`shopify.app.toml` is an environment-specific Shopify CLI config file. It must contain real Partner Dashboard values before production use.

Use `shopify.app.toml.example` as the template and do not commit production secrets.

Manual fields:

- `client_id`
- `application_url`
- `[auth].redirect_urls`
- webhook URLs if using absolute URLs instead of relative paths

## Production Verification

TODO:

- Deploy over HTTPS.
- Run `npx prisma generate`.
- Run production migrations with `npx prisma migrate deploy`.
- Run `npm run build`.
- Start production server.
- Verify `/` returns the built app.
- Verify `/assets/*.js` and `/assets/*.css`.
- Verify `/auth?shop=<test-shop>.myshopify.com`.
- Verify `/auth/callback` through real Shopify OAuth.
- Verify `/api/shop`, `/api/products`, `/api/sync/products`, `/api/sync/orders`.
- Verify all webhooks with real Shopify delivery.
- Verify embedded app loads inside Shopify Admin.
- Verify frontend API requests include Shopify session tokens in embedded mode.
