# Protected Customer Data Explanation

Last updated: June 18, 2026

Status: TODO in Shopify Partner Dashboard.

China Supply Radar requests `read_orders` so it can calculate sales velocity from historical order line items. Sales velocity is used to estimate inventory cover days and generate reorder timing recommendations before China factory holiday slowdowns.

## Why `read_orders` Is Needed

The app needs order history to answer:

- How many units of each product variant sold during the selected time window.
- Estimated daily sales for each product variant.
- How many days current inventory is likely to cover.
- Which products may need reorder action before Chinese factory holidays.

Without order history, the app can sync products and inventory but cannot calculate reliable sales velocity.

## Fields Used

The app's GraphQL order sync uses only the fields needed for sales velocity:

- Order ID.
- Order created date.
- Order cancelled date.
- Line item quantity.
- Line item variant ID.
- Line item title/name for fallback display and matching.

## Customer PII Not Needed

The app does not need, request, store, or display:

- Customer names.
- Customer emails.
- Customer phone numbers.
- Customer addresses.
- Payment details.
- Credit card data.
- Shipping addresses.
- Billing addresses.
- Customer account profile data.

## How The Data Is Used

Order line items are aggregated by product variant. The app stores sales velocity records such as:

- Variant ID.
- Units sold.
- Calculation window.
- Estimated daily sales.
- Calculation start and end dates.

These values are used to calculate inventory cover days and reorder recommendations.

## Data Retention And Deletion

- Sales velocity and recommendation data is stored per shop while the app is installed.
- App access tokens are encrypted at rest.
- When the app is uninstalled, the app marks the shop session as uninstalled.
- When the Shopify `shop/redact` webhook is received, shop-specific session data is deleted.
- Customer PII is not stored, so customer redact and data request webhooks are no-op handlers after HMAC verification.

## Partner Dashboard Protected Customer Data Request Draft

Use this explanation when completing the Shopify Partner Dashboard protected customer data request:

> China Supply Radar requests `read_orders` to calculate product-level sales velocity for inventory planning. The app reads order created date, cancellation status, line item quantity, line item variant ID, and line item title/name. This data is aggregated by variant to estimate units sold and daily sales velocity. The app uses these aggregate values to calculate inventory cover days and reorder timing recommendations before Chinese factory holiday slowdowns. The app does not read, store, or display customer names, emails, phone numbers, addresses, payment information, billing addresses, shipping addresses, or customer profile data.

## Review Team Test Instructions For `read_orders`

1. Install the app on a test Shopify store.
2. Ensure the store has test products, variants, inventory quantities, and a few test orders.
3. Open the app in Shopify Admin.
4. Click "Sync Order History".
5. Confirm that the Orders tab displays line item totals and estimated daily sales.
6. Confirm that Recommendations use sales velocity to estimate reorder timing.
7. Confirm no customer names, emails, phone numbers, addresses, or payment data appear in the app UI.
