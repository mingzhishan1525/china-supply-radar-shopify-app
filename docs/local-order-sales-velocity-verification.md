# Local Order to Sales Velocity Verification

Product line: `China Supply Radar / Shopify App`. This checklist verifies the
P0 Shopify App order-scanning and sales-velocity loop used for inventory
coverage days and replenishment recommendations.

Use this checklist to verify the real Shopify order sync loop:

1. Sync products first so local `VariantSnapshot` rows exist.

```bash
curl -X POST "http://localhost:3001/api/sync/products?shop=<test-shop>.myshopify.com"
```

2. In the Shopify test shop admin, create a test order for a real product variant.

- Use a product that appears in `GET /api/products`.
- Avoid Gift Card products; they are intentionally skipped.
- Keep the order active. Cancelled orders are skipped.
- Use a normal product line item with a Shopify variant id.

3. Sync orders for the default 30 day window.

```bash
curl -X POST "http://localhost:3001/api/sync/orders?shop=<test-shop>.myshopify.com&windowDays=30"
```

Expected response shape:

```json
{
  "ordersScanned": 1,
  "lineItemsScanned": 1,
  "variantsUpdated": 1,
  "matchedVariants": 1,
  "unmatchedLineItems": 0,
  "skippedCount": 0,
  "lastOrderCreatedAt": "2026-06-14T00:00:00.000Z",
  "syncStartedAt": "2026-06-14T00:01:00.000Z",
  "syncFinishedAt": "2026-06-14T00:01:01.000Z",
  "windowDays": 30,
  "calculatedFrom": "2026-05-15T00:01:00.000Z",
  "calculatedTo": "2026-06-14T00:01:00.000Z"
}
```

If there are no recent orders, `ordersScanned` and `variantsUpdated` will be
`0`. The app should keep products in `Needs sales data` state and must not
create fake velocity.

4. Check persisted sales velocity.

```bash
curl "http://localhost:3001/api/sales-velocity?shop=<test-shop>.myshopify.com"
```

For a matched variant, `estimatedDailySales` should equal
`unitsSold / windowDays`.

5. Regenerate recommendations.

```bash
curl -X POST "http://localhost:3001/api/recommendations/generate?shop=<test-shop>.myshopify.com"
```

Expected behavior:

- Variants with a supplier mapping and real `SalesVelocity` use
  `reason=calculated_from_sales_velocity`.
- Recommendations calculate `inventoryCoverDays`, `stockoutDate`,
  `latestReorderDate`, and `riskLevel`.
- Variants without order velocity stay `needs_sales_velocity`.
- Variants without a supplier mapping stay `needs_supplier_mapping`.
- Out of stock variants stay `out_of_stock`.

6. Verify in the frontend.

Open:

```text
http://localhost:5174/?shop=<test-shop>.myshopify.com
```

On Dashboard:

- Click `Sync orders`.
- Confirm orders scanned, line items scanned, variants updated, unmatched
  items, and window days.
- If no orders exist, confirm the empty state says the store has no recent
  orders and asks you to create a test order.

On Products:

- Variants with real order history show values like `0.80 units/day`.
- Variants without order history show `Needs sales data`.
