import type { BillingStatus } from "./billing.ts";

export const FREE_SKU_LIMIT = 1;

export type Entitlements = {
  plan: "FREE" | "PRO";
  skuLimit: number | null;
  supplierLimit: number | null;
  inventoryIntelligence: boolean;
  supplierIntelligence: boolean;
  weeklyAlerts: boolean;
};

export function entitlementsFromBilling(billing: BillingStatus): Entitlements {
  const isPro = billing.subscribed && billing.plan === "PRO";

  return {
    plan: isPro ? "PRO" : "FREE",
    skuLimit: isPro ? null : FREE_SKU_LIMIT,
    supplierLimit: isPro ? null : 1,
    // Free merchants must be able to reach first value before being asked to pay.
    // API responses enforce the one-SKU preview limit.
    inventoryIntelligence: true,
    supplierIntelligence: isPro,
    weeklyAlerts: isPro,
  };
}
