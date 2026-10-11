# Growth V0.1 — Activation Gate

Status: NOT PASSED. Local regression is complete; production acceptance is required.

## Change

Free merchants can open Suppliers, Orders and Recommendations. The Suppliers tab
now renders the existing SKU mapping table. Free creation stops after one supplier;
advanced supplier editing/deletion remains Pro. API reads use the same free SKU
across inventory, sales velocity, recommendations and the reorder queue. Repeating
the same mapping is allowed; hidden SKUs, other suppliers and concurrent extra
supplier creation are rejected. Pricing and trial settings are unchanged.

The supplier creation and mapping locks apply to the existing single-process
SQLite deployment. Verify the service remains one replica before release.

## Evidence collected on 2026-10-11

- `npm test`: 70 passed, zero failed.
- `npm run build`: passed after `npx prisma generate`.
- Build fixture has no production VITE_SHOPIFY_API_KEY; production must retain its
  existing deployment value. The missing-key build warning is local only.
- A Chrome local fixture using the production-built UI completed supplier creation,
  SKU mapping, order sync and a valid recommendation. 36 units at 2 units/day gave
  18 days of cover. Its ACTIVATE was received by a separate local-only collector.
  This is synthetic regression evidence, not Shopify production acceptance.
- Shopify Partner app history exposes installs, uninstalls, activated/cancelled
  charges and a test-charge flag.
- The supplied test store currently has an active test Pro subscription, so it
  cannot establish free activation until its state is reset or another free store
  is used.
- Railway's Shopify service is one replica and uses app.chinasupplyradar.com.
  The 10 visible service variables include neither GROWTH_ENGINE_API_URL nor
  REVENUE_OS_API_URL. Tracking destinations must be configured and validated.
- The existing growth-engine API's OpenAPI contract accepts ACTIVATE at /api/events.
  A stable metadata.event_id is sent by this app. Receiver deduplication is not
  verified; count unique shops/event IDs rather than raw ACTIVATE rows.

## Production acceptance (all mandatory)

1. Deploy the reviewed commit and verify the deployed revision and existing API key.
2. Configure GROWTH_ENGINE_API_URL to the verified growth API origin.
3. Use a newly installed, unsubscribed test store with recent sales and positive stock.
4. Add one supplier with lead time, map the visible SKU, sync orders and generate.
5. Verify a recommendation includes actual sales velocity, a supplier and reorder date.
6. Confirm the receiver stores ACTIVATE for this exact shop with plan=FREE,
   metadata.definition=real_sku_recommendation_with_supplier_and_sales_velocity,
   and metadata.event_id=first_value:shopify:<shop>:v1. Record receiver row ID/time.
7. Verify second supplier and second SKU requests return 402, concurrent creation
   cannot exceed the quota, and retries of the same mapping remain usable.
8. Verify no ACTIVATE when supplier or sales information is missing.

Do not call the gate passed from a local fixture, a successful HTTP response alone,
or a Pro session. Do not start acquisition until production evidence is complete.

Resetting a currently installed store by uninstalling deletes its app-held data;
obtain explicit confirmation before that action. Installing again may present new
permission consent and should be confirmed at the Shopify permission screen.
