import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redirectToShopifyBillingApproval } from "./billingRedirect.ts";

describe("Shopify Billing approval redirect", () => {
  it("opens the confirmation URL in the top-level browsing context", () => {
    const calls: Array<{ url: string; target: string }> = [];

    redirectToShopifyBillingApproval(
      "https://admin.shopify.com/store/demo/charges/approve",
      {
        open(url, target) {
          calls.push({ url, target });
        },
      },
    );

    assert.deepEqual(calls, [
      {
        url: "https://admin.shopify.com/store/demo/charges/approve",
        target: "_top",
      },
    ]);
  });

  it("rejects a non-HTTPS approval URL", () => {
    assert.throws(
      () => redirectToShopifyBillingApproval("http://example.com/approve", { open() {} }),
      /must use HTTPS/,
    );
  });
});
