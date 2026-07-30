import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isShopifyBillingTestMode } from "./billing.ts";

describe("Shopify Billing environment mode", () => {
  it("defaults to live billing", () => {
    assert.equal(isShopifyBillingTestMode({}), false);
  });

  it("enables test billing only for the exact value 1", () => {
    assert.equal(isShopifyBillingTestMode({ SHOPIFY_BILLING_TEST: "1" }), true);
    assert.equal(isShopifyBillingTestMode({ SHOPIFY_BILLING_TEST: "true" }), false);
    assert.equal(isShopifyBillingTestMode({ SHOPIFY_BILLING_TEST: "0" }), false);
  });
});
