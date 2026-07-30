# Shopify review suspension — 2026-07-30

## Reviewer finding

The submission was suspended until 2026-08-14 under requirement 1.2.2:
Shopify App Pricing / Shopify Billing API.

During review, selecting a plan displayed:

```text
admin.shopify.com refused to connect
```

This prevented the reviewer from confirming that the app uses Shopify Billing
and supports accepting, declining, and requesting charge approval again after
reinstall.

## Root cause

The embedded app used:

```ts
window.location.assign(confirmationUrl);
```

Because the app runs inside a Shopify Admin iframe, this attempted to render the
Shopify billing confirmation page inside the iframe. Shopify Admin blocks that
embedding.

## Fix

Billing confirmation now opens in the top-level browsing context:

```ts
window.open(confirmationUrl, "_top");
```

The redirect helper also rejects non-HTTPS approval URLs. An automated
regression test verifies the `_top` target.

## Required verification before resubmission

Use a clean review test store and record the complete flow:

1. Install or reinstall the app.
2. Open the embedded app from Shopify Admin.
3. Select the Pro plan.
4. Confirm that the Shopify-hosted approval page replaces the top-level Admin
   page and does not render inside the app iframe.
5. Decline once and verify the merchant can start approval again.
6. Approve the test charge.
7. Return to the app and verify Pro status is active.
8. Uninstall, reinstall, and verify approval can be requested again.
9. Confirm no external payment form or off-platform billing is shown.

Do not resubmit before 2026-08-14. The suspension email requires all other app
review requirements to be satisfied before resubmission.
