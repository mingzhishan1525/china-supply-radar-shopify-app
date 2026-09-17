# Shopify review repair candidate — 2026-09-17

Status: local verification passed; deployment and recorded real-store acceptance pending.

## Changes in audit order

1. Require signed Shopify session tokens for merchant APIs, including reads and extension link creation. Validate destination, issuer, audience, expiry and not-before. Keep the separately signed extension entitlement and HMAC webhook routes independent.
2. Reuse valid offline sessions; single-flight managed-install token exchange; bounded token calls; preserve actual granted scopes. Recover one explicit Admin API 401 using the authenticated request's ID token. Do not retry ambiguous mutation failures.
3. Stop startup when Prisma deployment migrations fail.
4. Report incomplete product writes as a retryable failed sync without a successful completion timestamp. Existing UI error handling exposes the retry path.
5. Complete uninstall cleanup before acknowledging, without waiting for telemetry. Return 503 if cleanup fails so Shopify can retry. Ignore delayed uninstall events older than the current session installation, and serialize token replacement/refresh with cleanup within the current single-instance SQLite service.
6. Paginate products, variants, orders and order line items. Limit product query fan-out. Reset all known variant velocities in an empty sales window. Bound the queried date interval; reject >60-day windows without read_all_orders.
7. Ask Shopify for the development-store flag before charge creation. Test charges are enabled for verified development stores or an explicit test environment; normal shops retain live billing.
8. OAuth and billing returns re-enter Shopify Admin to obtain fresh embedded context. The public billing return does not query shop data or grant entitlements. Subscription revenue attribution runs from authenticated, Shopify-verified status reads with a stable external event ID; test subscriptions report zero revenue. Public-return growth events were removed.

## Local evidence

- `npm run build`: passed (TypeScript + Vite).
- `npm test`: 67 passed, 0 failed (54 original + 13 regression cases).
- `git diff --check`: passed.
- Regression cases include missing/cross-shop JWTs, concurrent install bootstrap, cached-token reuse, token rejection/network failures, explicit 401 recovery, total/partial product write failures, nested pagination, repeated cursors, 101 order line items, empty-window reset, delayed/duplicate uninstall, telemetry independence, cleanup failures, startup migration failure, and live/test billing selection.

## Required final-version evidence (not yet completed)

Pin one commit in the deployed environment and do not change it during recording. Record:

1. Fresh install, app landing page without authentication/sync errors.
2. Product and order sync, including retry; verify actual values.
3. Request subscription and decline; return to Free.
4. Request again and approve a visibly labelled test charge; verify Pro.
5. Uninstall; verify webhook cleanup and no retained entitlement.
6. Reinstall the same deployed build; sync and request a new approval.

Also verify extension entitlement, recommendation output, failed-token behavior and Revenue OS attribution. Staging validation does not by itself prove production app identity/configuration. No resubmission before the email's suspension end date, 2026-09-27.

## Operational limits

- Lifecycle serialization assumes the existing single-instance SQLite deployment; do not scale to multiple replicas without shared coordination.
- Critical cleanup failures are retried; telemetry remains best-effort.
- Unit tests use synthetic shops and cannot prove Shopify approval pages, permissions, installed scopes or production configuration.
- No real payment approved and no final-flow video created as of this record.

## Primary references

- [Shopify app requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [ShopPlan development-store flag](https://shopify.dev/docs/api/admin-graphql/2026-04/objects/ShopPlan)
- [Billing subscription test argument](https://shopify.dev/docs/api/admin-graphql/2026-04/mutations/appSubscriptionCreate)
- [Development-store testing](https://shopify.dev/docs/apps/build/stores/development-stores)
- [Webhook delivery verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
