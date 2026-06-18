export type RiskLevel = "low" | "medium" | "high" | "critical";

export type VariantInput = {
  shopifyVariantId: string;
  productTitle: string;
  variantTitle: string;
  sku?: string;
  inventoryQuantity: number;
  unitsPerDay: number;
};

export type SupplierAssumptions = {
  supplierId?: string;
  supplierName?: string;
  productionLeadTimeDays: number;
  shippingLeadTimeDays: number;
  bufferDays: number;
};

export type HolidayWindow = {
  name: string;
  startsOn: string;
  endsOn: string;
  severity: "medium" | "high" | "critical";
  riskLeadTimeDays: number;
};

export type ReorderRecommendation = {
  shopifyVariantId: string;
  productTitle: string;
  variantTitle: string;
  sku?: string;
  supplierId?: string;
  supplierName?: string;
  inventoryQuantity: number;
  unitsPerDay: number;
  inventoryCoverageDays: number | null;
  totalLeadTimeDays: number;
  estimatedStockoutDate: string | null;
  latestReorderDate: string | null;
  riskLevel: RiskLevel;
  riskReasons: string[];
};

const dayMs = 24 * 60 * 60 * 1000;

export function calculateReorderRecommendation(
  variant: VariantInput,
  assumptions: SupplierAssumptions | null,
  holidays: HolidayWindow[],
  today = new Date(),
): ReorderRecommendation {
  const totalLeadTimeDays = assumptions
    ? assumptions.productionLeadTimeDays +
      assumptions.shippingLeadTimeDays +
      assumptions.bufferDays
    : 0;

  const riskReasons: string[] = [];
  const inventoryCoverageDays =
    variant.unitsPerDay > 0
      ? Math.floor(variant.inventoryQuantity / variant.unitsPerDay)
      : null;

  if (!assumptions) {
    riskReasons.push("Supplier lead time is missing");
  }

  if (variant.unitsPerDay <= 0) {
    riskReasons.push("Sales velocity is missing");
  }

  if (variant.inventoryQuantity <= 0) {
    riskReasons.push("Inventory is already depleted");
  }

  const estimatedStockoutDate =
    inventoryCoverageDays === null
      ? null
      : addDays(today, inventoryCoverageDays).toISOString();

  const latestReorderDate =
    estimatedStockoutDate && totalLeadTimeDays > 0
      ? addDays(new Date(estimatedStockoutDate), -totalLeadTimeDays).toISOString()
      : null;

  if (inventoryCoverageDays !== null && assumptions) {
    if (inventoryCoverageDays <= totalLeadTimeDays) {
      riskReasons.push("Inventory coverage is shorter than total lead time");
    } else if (inventoryCoverageDays <= totalLeadTimeDays + 14) {
      riskReasons.push("Inventory buffer is less than 14 days");
    }
  }

  for (const holiday of holidays) {
    if (doesLeadTimeIntersectHoliday(today, totalLeadTimeDays, holiday)) {
      riskReasons.push(`${holiday.name} may affect production or shipping`);
    }
  }

  return {
    shopifyVariantId: variant.shopifyVariantId,
    productTitle: variant.productTitle,
    variantTitle: variant.variantTitle,
    sku: variant.sku,
    supplierId: assumptions?.supplierId,
    supplierName: assumptions?.supplierName,
    inventoryQuantity: variant.inventoryQuantity,
    unitsPerDay: variant.unitsPerDay,
    inventoryCoverageDays,
    totalLeadTimeDays,
    estimatedStockoutDate,
    latestReorderDate,
    riskLevel: determineRiskLevel({
      inventoryCoverageDays,
      totalLeadTimeDays,
      riskReasons,
    }),
    riskReasons,
  };
}

export function determineRiskLevel(input: {
  inventoryCoverageDays: number | null;
  totalLeadTimeDays: number;
  riskReasons: string[];
}): RiskLevel {
  if (
    input.inventoryCoverageDays === 0 ||
    input.riskReasons.includes("Inventory is already depleted")
  ) {
    return "critical";
  }

  if (
    input.inventoryCoverageDays !== null &&
    input.totalLeadTimeDays > 0 &&
    input.inventoryCoverageDays <= input.totalLeadTimeDays
  ) {
    return "critical";
  }

  if (input.riskReasons.length >= 2) {
    return "high";
  }

  if (input.riskReasons.length === 1) {
    return "medium";
  }

  return "low";
}

export function doesLeadTimeIntersectHoliday(
  today: Date,
  totalLeadTimeDays: number,
  holiday: HolidayWindow,
): boolean {
  const riskWindowStart = addDays(new Date(holiday.startsOn), -holiday.riskLeadTimeDays);
  const holidayEnd = new Date(holiday.endsOn);
  const leadTimeEnd = addDays(today, totalLeadTimeDays);

  return today <= holidayEnd && leadTimeEnd >= riskWindowStart;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * dayMs);
}
