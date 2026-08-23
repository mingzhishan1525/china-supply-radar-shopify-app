# P0 Release Gate — 2026-08-05

## Scope

Canonical application: China Supply Radar Shopify App.

No new feature work is in scope. This gate covers only security, billing, reliability, compliance, and the first real merchant value path.

## Verified automatically

- [x] Canonical repository is clean and synchronized with `origin/main` at `ae57a7f`.
- [x] `npm test`: 47 tests passed, 0 failed.
- [x] `npm run typecheck`: passed.
- [x] `npm run build`: passed.
- [x] Production root `https://app.chinasupplyradar.com/`: HTTP 200.
- [x] Staging root `https://china-supply-radar-shopify-app-staging.up.railway.app/`: HTTP 200.
- [x] Production `/auth` generates a Shopify OAuth redirect with the production client ID, required scopes, and production callback.
- [x] Staging `/auth` generates a Shopify OAuth redirect with the staging client ID, required scopes, and staging callback.
- [x] Billing redirect regression test verifies the Shopify approval page opens in the top-level browsing context.
- [x] Automated coverage exists for OAuth HMAC, token encryption, token refresh, uninstall HMAC and cleanup, Billing subscription detection, signed extension codes, product/order sync, recommendations, and signed attribution events.

## Real development-store acceptance

Use the staging app and a clean Shopify development store. Record a screencast and timestamped logs.

- [ ] Install/reinstall through OAuth and confirm the embedded app loads.
- [ ] Synchronize products and orders; record counts and any Shopify API errors.
- [ ] Generate a reorder recommendation from synchronized store data.
- [ ] Start the $29 test subscription, decline once, retry, approve, and confirm `Subscription active`.
- [ ] Connect the production Chrome extension and verify valid, tampered, expired, cancelled, backend-unavailable, and reconnect-without-data-loss cases.
- [ ] Uninstall the app and verify webhook delivery, session deletion, and merchant-data cleanup; reinstall and request approval again.
- [ ] Verify `paywall_view -> upgrade_click -> checkout_start -> subscription_start` plus the first-value activation event reach the configured attribution destination.

## Current blockers

1. The live Shopify UI flow has not been completed. A logged-in Staging Dev Dashboard tab exists, but browser control timed out before the app/store configuration could be inspected.
2. Cloud environment variables could not be verified through the Railway CLI because the local checkout does not expose a usable project binding.
3. Shopify review is suspended until 2026-08-14. Do not resubmit before that date or before every real-store item above passes.

## Revalidation — 2026-08-23

- [x] `npm test`: 49 tests passed, 0 failed.
- [x] `npm run typecheck`: passed.
- [x] `npm run build`: passed (1,098 modules transformed).
- [x] Production root `https://app.chinasupplyradar.com/`: HTTP 200 with valid TLS.
- [x] Legacy Railway staging root remains reachable: HTTP 200 with valid TLS.
- [ ] Proposed staging root `https://staging-app.chinasupplyradar.com/` timed out after 20 seconds and is not deploy-ready.

The production Shopify config now contains only the production OAuth callback. The staging config continues to use the reachable Railway URL; the proposed custom hostname must not be configured until it is reachable and its Shopify dashboard callback is verified.

## Required human handoff

Open the logged-in Shopify Staging Dev Dashboard and the intended development store, then keep both tabs available. The next execution pass should begin with the OAuth install and stop for confirmation immediately before approving the test subscription or any other externally consequential action.
