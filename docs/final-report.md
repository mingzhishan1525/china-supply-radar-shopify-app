# Pre-Submission Fix Sprint Report

Last updated: June 18, 2026

## Executive Summary

China Supply Radar is not ready to submit to Shopify review yet.

The codebase builds and tests locally, and the submission strategy is now Free Beta / Free MVP. Billing API is intentionally deferred. The remaining blockers are production configuration, real Shopify Partner Dashboard setup, public legal URLs, protected customer data review, listing assets, and review-store testing.

## Submission Strategy

Current pricing: Free beta.

No charges are made through Shopify at this time.

Future paid plans may be introduced later with advance notice.

## What Is Completed

- Local build passes.
- Local test suite passes.
- OAuth and webhook HMAC verification exist.
- Access tokens are encrypted at rest.
- Product, inventory, order sync, sales velocity, supplier mapping, recommendations, and reorder queue code exists.
- GDPR webhook handlers exist.
- App Bridge CDN is included in `index.html`.
- Frontend attempts to attach Shopify session tokens to API requests when embedded.
- Public Terms and listing drafts no longer claim active paid plans, 14-day free trial, or automatic billing.

## What Is Partial

- App Bridge/session-token support exists, but must be tested inside a real Shopify Admin embedded install.
- API token verification validates Bearer tokens when present, while preserving local/demo compatibility.
- GDPR documentation exists, but webhook delivery must be verified from real Shopify webhook events.
- Listing copy exists as a draft, but assets and public URLs are not complete.

## Blocking Items

### Production Configuration

Status: REQUIRES PRODUCTION CONFIG.

- Set real production HTTPS URL.
- Set real Partner Dashboard client ID.
- Set real redirect URL.
- Set production webhook URLs.
- Set production environment variables.
- Configure production database.
- Run production Prisma migrations.

### Public Legal URLs

Status: REQUIRES PRODUCTION CONFIG.

- Publish Privacy Policy.
- Publish Terms of Service.
- Confirm both URLs are public and match Partner Dashboard/listing fields.

### Protected Customer Data

Status: TODO.

- Complete Partner Dashboard Protected Customer Data request for `read_orders`.
- Explain that order line items and variant IDs are used to calculate sales velocity.
- Explain that customer PII is not read or stored.

### Listing Assets

Status: TODO.

- App icon.
- Screenshots.
- Banner image.
- Demo screencast or review walkthrough.

### Review Store

Status: TODO.

- Create Shopify test store with sample products, inventory, and orders.
- Install app through real OAuth.
- Verify product sync, order sync, supplier setup, recommendations, and uninstall webhook.
- Provide review instructions and access.

## Final Status

Code Ready: PARTIAL.

Config Ready: FAIL.

Production Ready: FAIL.

Listing Ready: FAIL.

Review Ready: FAIL.

Do not submit until the production URL, public legal URLs, Partner Dashboard configuration, Protected Customer Data request, listing assets, and review-store install flow are complete and verified.
