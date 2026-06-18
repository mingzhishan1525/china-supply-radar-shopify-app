import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateReorderRecommendation,
  doesLeadTimeIntersectHoliday,
} from "./reorder.ts";

const today = new Date("2026-06-12T00:00:00.000Z");

describe("calculateReorderRecommendation", () => {
  it("calculates stockout and latest reorder dates", () => {
    const result = calculateReorderRecommendation(
      {
        shopifyVariantId: "gid://shopify/ProductVariant/1",
        productTitle: "Travel Adapter",
        variantTitle: "US Plug",
        inventoryQuantity: 120,
        unitsPerDay: 4,
      },
      {
        supplierId: "supplier-1",
        supplierName: "Shenzhen Power Co.",
        productionLeadTimeDays: 20,
        shippingLeadTimeDays: 12,
        bufferDays: 5,
      },
      [],
      today,
    );

    assert.equal(result.inventoryCoverageDays, 30);
    assert.equal(result.totalLeadTimeDays, 37);
    assert.equal(result.riskLevel, "critical");
    assert.equal(result.riskReasons[0], "Inventory coverage is shorter than total lead time");
  });

  it("flags missing supplier assumptions", () => {
    const result = calculateReorderRecommendation(
      {
        shopifyVariantId: "gid://shopify/ProductVariant/2",
        productTitle: "Silicone Bag",
        variantTitle: "Blue",
        inventoryQuantity: 300,
        unitsPerDay: 5,
      },
      null,
      [],
      today,
    );

    assert.equal(result.totalLeadTimeDays, 0);
    assert.equal(result.riskLevel, "medium");
    assert.deepEqual(result.riskReasons, ["Supplier lead time is missing"]);
  });
});

describe("doesLeadTimeIntersectHoliday", () => {
  it("detects upcoming holiday risk inside lead time horizon", () => {
    const intersects = doesLeadTimeIntersectHoliday(today, 45, {
      name: "National Day",
      startsOn: "2026-10-01T00:00:00.000Z",
      endsOn: "2026-10-07T00:00:00.000Z",
      severity: "high",
      riskLeadTimeDays: 90,
    });

    assert.equal(intersects, true);
  });
});
