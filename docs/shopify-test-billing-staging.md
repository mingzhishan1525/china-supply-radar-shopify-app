# Shopify Test-Billing Staging

Use a separate staging deployment and Shopify development store for end-to-end
billing validation. Do not enable test billing in production.

## Required staging variables

```text
SHOPIFY_BILLING_TEST=1
SHOPIFY_APP_URL=https://<staging-host>
```

Copy the remaining Shopify credentials, encryption key, database configuration,
and scopes from the approved environment through the deployment provider's
private variable controls. Do not copy secret values into source control.

Add this callback URL to the Shopify app configuration before testing:

```text
https://<staging-host>/api/auth/callback
```

## Production invariant

```text
SHOPIFY_BILLING_TEST=0
```

Production must create live Shopify Billing subscriptions. Test mode is only for
development-store acceptance testing.

## Acceptance flow

1. Install or reinstall the app in the development store.
2. Open the embedded app.
3. Select `Start $29/month`.
4. Confirm Shopify opens the approval page in the top-level Admin context.
5. Cancel the test subscription request.
6. Return to the app and request approval again.
7. Approve the test subscription.
8. Verify the app returns successfully and reports `Subscription active`.
9. Uninstall, reinstall, and confirm approval can be requested again.

Capture a short screencast of the complete flow for the Shopify reviewer.
