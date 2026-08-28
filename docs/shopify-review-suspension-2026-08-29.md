# Shopify review suspension remediation — 2026-08-29

Shopify reference: `129479`

## Review findings

- Requirement 1.2.2: starting the $29/month subscription returned HTTP 500.
- Requirement 2.1.1: the initial Shopify product sync returned HTTP 500 and the UI displayed `Shopify data sync failed`.
- Temporary suspension ends on 2026-09-27; resubmission is unavailable before that date.

## Root cause

The production SQLite database predated Prisma migration history. The `ShopSession` table was missing the expiring offline-token columns introduced by migration `20260804014000_add_expiring_offline_tokens`. Both billing and product sync load the shop session before calling Shopify, so both paths failed with the same missing-column exception.

## Production remediation

- Created `/data/prod.db.backup-before-review-fix-20260829` before changing the database.
- Baseline-marked the three historical migrations whose tables already existed.
- Applied `20260804014000_add_expiring_offline_tokens` and confirmed `prisma migrate status` reports no pending migrations.
- Enabled `RUN_DB_MIGRATIONS=1` so every production start runs `prisma migrate deploy` before the server starts.
- Verified requests for uninstalled shops now return `401 shop_not_installed` instead of HTTP 500.

## Application hardening

- Unexpected server exceptions are logged server-side and returned to merchants as a generic message without database internals.
- Expired or rejected Shopify authorization now displays an actionable `Reconnect Shopify` warning instead of a generic critical sync failure.
- Removed a stale unconditional startup message about switching billing modes; the app uses Shopify App-Managed Billing and detects actual Managed Pricing conflicts from Shopify GraphQL errors.

## Release gate before resubmission

1. Install or reinstall the production app on a clean Shopify development store to obtain a fresh offline token.
2. Confirm initial product and inventory sync completes without 4xx/5xx responses.
3. Start the Pro subscription, approve the Shopify-hosted charge, and confirm the app returns with Pro entitlements.
4. Decline a charge and confirm the app remains usable on the Free plan.
5. Uninstall and reinstall, then confirm approval can be requested again.
6. Re-run Shopify automated checks and resubmit after 2026-09-27.
