# Shopify App Store Pre-Submission Checklist

Last updated: July 31, 2026

Strategy: Free plan plus $29/month Pro through Shopify App-Managed Billing.

## Code

- [x] Local build passes.
- [x] Local test suite passes.
- [x] OAuth implementation exists.
- [x] HMAC verification exists for OAuth and webhooks.
- [x] Access tokens are encrypted at rest.
- [x] Product sync, order sync, sales velocity, supplier mapping, recommendations, and reorder queue code exists.
- [x] App Bridge CDN is included.
- [x] Frontend attempts to attach Shopify session token to API requests when embedded.
- [ ] TODO: Test the embedded app inside Shopify Admin against a real production or tunnel URL.
- [ ] TODO: Confirm session-token behavior with a real Shopify install.

## Shopify Partner Dashboard

- [ ] REQUIRES PRODUCTION CONFIG: real app URL.
- [ ] REQUIRES PRODUCTION CONFIG: real redirect URL.
- [ ] REQUIRES PRODUCTION CONFIG: real client ID in local/private app config.
- [ ] REQUIRES PRODUCTION CONFIG: webhook subscriptions.
- [ ] REQUIRES PRODUCTION CONFIG: Protected Customer Data request for `read_orders`.
- [ ] REQUIRES PRODUCTION CONFIG: select App-Managed Billing in Partner Dashboard.
- [ ] TODO: verify a real $29 test subscription, cancellation, and Free downgrade.
- [ ] TODO: Add review test store.
- [ ] TODO: Add emergency developer contact.

## Production

- [ ] REQUIRES PRODUCTION CONFIG: HTTPS deployment.
- [ ] REQUIRES PRODUCTION CONFIG: production environment variables.
- [ ] REQUIRES PRODUCTION CONFIG: production database.
- [ ] TODO: run `npx prisma migrate deploy` in production.
- [ ] TODO: verify production `/`, `/auth`, `/auth/callback`, `/api/*`, and webhook endpoints.
- [ ] TODO: verify production logs do not expose access tokens or secrets.

## Legal And Listing

- [x] Free and $29 Pro pricing copy drafted.
- [x] Terms describe Shopify Billing and cancellation downgrade.
- [x] Listing matches the implemented Free/Pro entitlements.
- [ ] REQUIRES PRODUCTION CONFIG: public Privacy Policy URL.
- [ ] REQUIRES PRODUCTION CONFIG: public Terms URL.
- [ ] TODO: app icon.
- [ ] TODO: screenshots.
- [ ] TODO: banner image.
- [ ] TODO: demo screencast or review walkthrough.
- [ ] TODO: Partner Dashboard listing fields.

## Review Test Plan

TODO: Provide Shopify review with:

1. Test store URL.
2. Staff access or credentials, if needed.
3. Install URL or Partner Dashboard review instructions.
4. Steps to sync products.
5. Steps to sync orders.
6. Steps to add supplier lead time.
7. Steps to view recommendations.
8. Steps to approve a Shopify test charge and verify cancellation downgrade.
9. Explanation that `read_orders` is used only for sales velocity from order line items and variant IDs.

## Final Status

Code Ready: PARTIAL.

Config Ready: FAIL.

Production Ready: FAIL.

Listing Ready: FAIL.

Review Ready: FAIL.
