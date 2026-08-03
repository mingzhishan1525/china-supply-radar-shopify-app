# Project Status

- Status: `ACTIVE`
- Canonical: `YES`
- Priority: `P0`
- Product line: `China Supply Radar`
- Role: Primary commercial Shopify application
- Canonical remote: `git@github.com:mingzhishan1525/china-supply-radar-shopify-app.git`
- Production target: `https://app.chinasupplyradar.com`

## Current release gate

Complete and record one real Shopify development-store flow:

1. OAuth installation
2. Product and order synchronization
3. Reorder recommendation generation
4. Shopify Billing subscription
5. Chrome Extension Pro entitlement
6. Uninstall webhook and data cleanup
7. Revenue OS attribution event delivery

Unit tests and type checks are required but do not replace this real-store validation.

## Scope control

- This repository owns Shopify OAuth, sessions, webhooks, billing, store data synchronization, recommendations, and subscription entitlement.
- Do not create another Shopify backend for this product line.
- Historical Shopify implementations are reference-only; port individual fixes only after review.
- Until the release gate passes, prioritize security, billing, reliability, compliance, and first-user value over new features.

