# Shopify App V1 Implementation Notes

Date: 2026-06-12

Product line: `China Supply Radar / Shopify App`. This is the P0 primary
commercial product for Shopify merchants, not a standalone experiment and not
part of the Chrome Extension or Growth Engine codebase.

## Architecture

The current starter separates three concerns:

- `src/domain`: pure reorder and risk logic
- `src/ui`: Polaris-based embedded app UI prototype
- `src/shopify`: GraphQL Admin API query stubs
- `src/server`: OAuth, sessions, webhooks, API routes, and sync services
- `src/security`: HMAC verification and token encryption

This keeps the reorder engine portable when the app moves from local prototype
to the official Shopify app runtime.

## Data Flow

1. Merchant installs app.
2. OAuth stores an encrypted offline access token.
3. App syncs products, variants, inventory quantities, and locations.
4. Merchant creates suppliers and maps variants to suppliers.
5. App calculates coverage days, stockout date, latest reorder date, and risk level.
6. Holiday windows add production and shipping risk reasons.
7. Dashboard ranks variants by action urgency.

## Scope Strategy

Start with:

- `read_products`
- `read_inventory`

Avoid `read_orders` until sales velocity needs to come from historical orders.
If added, document why order access is necessary in the Shopify App Store
review notes.

## Review Risk Notes

- Do not require Chrome extension installation.
- Do not claim purchase order automation in V1.
- Do not write to products, inventory, orders, or checkout in V1.
- Keep app listing screenshots aligned with actual UI.
- Provide a demo store and exact review path.

## First Backend Tasks

- Add Prisma migration.
- Add supplier CRUD.
- Add variant mapping CRUD.
- Add scheduled/background product sync.
- Add API authentication using embedded app session tokens.
