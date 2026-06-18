import type { HolidayWindow, SupplierAssumptions, VariantInput } from "./reorder";

export const sampleVariants: VariantInput[] = [
  {
    shopifyVariantId: "gid://shopify/ProductVariant/1001",
    productTitle: "Cordless Milk Frother",
    variantTitle: "Black",
    sku: "FROTHER-BLK",
    inventoryQuantity: 420,
    unitsPerDay: 18,
  },
  {
    shopifyVariantId: "gid://shopify/ProductVariant/1002",
    productTitle: "Travel Adapter",
    variantTitle: "US Plug",
    sku: "ADAPTER-US",
    inventoryQuantity: 128,
    unitsPerDay: 7,
  },
  {
    shopifyVariantId: "gid://shopify/ProductVariant/1003",
    productTitle: "Silicone Storage Bag",
    variantTitle: "Starter Set",
    sku: "BAG-SET",
    inventoryQuantity: 960,
    unitsPerDay: 12,
  },
];

export const sampleAssumptionsByVariant: Record<string, SupplierAssumptions | null> = {
  "gid://shopify/ProductVariant/1001": {
    supplierId: "supplier-shenzhen-homeware",
    supplierName: "Shenzhen Homeware Ltd.",
    productionLeadTimeDays: 24,
    shippingLeadTimeDays: 18,
    bufferDays: 7,
  },
  "gid://shopify/ProductVariant/1002": {
    supplierId: "supplier-ningbo-electronics",
    supplierName: "Ningbo Electronics Co.",
    productionLeadTimeDays: 35,
    shippingLeadTimeDays: 22,
    bufferDays: 10,
  },
  "gid://shopify/ProductVariant/1003": null,
};

export const sampleHolidays: HolidayWindow[] = [
  {
    name: "China National Day",
    startsOn: "2026-10-01T00:00:00.000Z",
    endsOn: "2026-10-07T00:00:00.000Z",
    severity: "high",
    riskLeadTimeDays: 75,
  },
  {
    name: "Chinese New Year",
    startsOn: "2027-02-06T00:00:00.000Z",
    endsOn: "2027-02-20T00:00:00.000Z",
    severity: "critical",
    riskLeadTimeDays: 90,
  },
];
