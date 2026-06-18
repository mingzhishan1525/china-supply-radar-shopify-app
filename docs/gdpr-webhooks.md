# GDPR Webhooks Implementation

## Overview
This document describes the implementation of Shopify-mandated GDPR webhooks for the China Supply Radar app.

## Implemented Endpoints

### 1. `/webhooks/gdpr/customers_data_request` (CUSTOMERS_DATA_REQUEST)
- **Purpose**: Triggered when a customer requests access to their personal data stored by the app
- **Behavior**: 
  - Validates Shopify HMAC signature
  - Logs the request for security auditing
  - Returns 200 OK immediately
  - No-op implementation: Our app does not store any personal customer data (names, emails, addresses, etc.)

### 2. `/webhooks/gdpr/customers_redact` (CUSTOMERS_REDACT)
- **Purpose**: Triggered when a customer requests deletion of their personal data stored by the app
- **Behavior**:
  - Validates Shopify HMAC signature
  - Logs the request for security auditing
  - Returns 200 OK immediately
  - No-op implementation: Our app does not store any personal customer data

### 3. `/webhooks/gdpr/shop_redact` (SHOP_REDACT)
- **Purpose**: Triggered when a shop owner requests deletion of all their store's data
- **Behavior**:
  - Validates Shopify HMAC signature
  - Logs the request for security auditing
  - Deletes all session and access token data for the specified shop
  - Retains anonymized order statistics (no personal data is kept)
  - Returns 200 OK immediately

## Security Features
- All webhooks require valid Shopify HMAC signature verification
- Invalid HMAC signatures return 401 Unauthorized
- All webhook requests are logged with [SECURITY] level for auditing
- Webhook processing does not block responses (returns 200 immediately after validation)

## Data Retention Policy
- We do not store any personal customer data
- Shop-specific session data is deleted when a SHOP_REDACT request is received
- Anonymized aggregate order statistics are retained for product improvement purposes
- No data is shared with third parties

## Testing
### Local Testing with curl
1. Start the local server: `npm run dev`
2. Send a test request (replace HMAC and API secret with your values):
```bash
# Test valid HMAC request
curl -X POST http://localhost:3001/webhooks/gdpr/customers_data_request \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Shop-Domain: test-shop.myshopify.com" \
  -H "X-Shopify-Hmac-Sha256: <valid-hmac>" \
  -d '{"shop_domain": "test-shop.myshopify.com", "customer": {"id": 12345, "email": "customer@example.com"}, "orders_requested": [111, 222]}'

# Test invalid HMAC request (should return 401)
curl -X POST http://localhost:3001/webhooks/gdpr/customers_data_request \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Shop-Domain: test-shop.myshopify.com" \
  -H "X-Shopify-Hmac-Sha256: invalid-hmac" \
  -d '{}'
```

## Shopify Configuration
The webhook subscriptions are configured in `shopify.app.toml`:
```toml
[[webhooks.subscriptions]]
topics = ["customers/data_request"]
uri = "/webhooks/gdpr/customers_data_request"

[[webhooks.subscriptions]]
topics = ["customers/redact"]
uri = "/webhooks/gdpr/customers_redact"

[[webhooks.subscriptions]]
topics = ["shop/redact"]
uri = "/webhooks/gdpr/shop_redact"
```
