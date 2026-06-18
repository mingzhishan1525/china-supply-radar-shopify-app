import { calculateReorderRecommendation } from "../domain/reorder.ts";
import type { VariantSnapshot } from "./productSync.ts";

export type SupplierRecord = {
  id?: string;
  shop: string;
  name: string;
  country: string;
  province: string | null;
  city: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  wechat: string | null;
  whatsapp: string | null;
  leadTimeDays: number;
  moq: number | null;
  notes: string | null;
  riskLevel: string;
  isActive: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type SupplierMappingRecord = {
  id?: string;
  shop: string;
  variantSnapshotId: string;
  supplierId: string;
  supplierSku: string | null;
  factoryLeadTimeDays: number;
  reorderBufferDays: number;
  moq: number | null;
  notes: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type SalesVelocityRecord = {
  id?: string;
  shop: string;
  shopifyVariantId: string;
  variantSnapshotId: string;
  unitsSold: number;
  windowDays: number;
  estimatedDailySales: number;
  calculatedFrom: Date | string;
  calculatedTo: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type RecommendationRecord = {
  id?: string;
  shop: string;
  variantSnapshotId: string;
  supplierId: string | null;
  currentInventory: number;
  estimatedDailySales: number | null;
  inventoryCoverDays: number | null;
  stockoutDate: Date | string | null;
  latestReorderDate: Date | string | null;
  riskLevel: string;
  reason: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type SupplierInput = Partial<SupplierRecord> & {
  name?: string;
};

export type SupplierMappingInput = Partial<SupplierMappingRecord> & {
  variantSnapshotId?: string;
  supplierId?: string;
};

export type GenerateRecommendationsResult = {
  generatedCount: number;
  skippedCount: number;
  recommendations: RecommendationRecord[];
};

export type ReorderQueueItem = {
  sku: string | null;
  productTitle: string;
  variantTitle: string;
  inventory: number;
  estimatedDailySales: number;
  inventoryCoverDays: number;
  recommendedReorderDate: Date | string;
  riskLevel: string;
};

export type SupplyChainClient = {
  supplier: {
    findMany(args: { where: { shop: string; isActive?: boolean }; orderBy?: Array<Record<string, "asc" | "desc">> }): Promise<SupplierRecord[]>;
    findFirst(args: { where: { id?: string; shop: string; isActive?: boolean } }): Promise<SupplierRecord | null>;
    create(args: { data: SupplierRecord }): Promise<SupplierRecord>;
    update(args: { where: { id: string }; data: Partial<SupplierRecord> }): Promise<SupplierRecord>;
  };
  supplierMapping: {
    findMany(args: { where: { shop: string }; orderBy?: Array<Record<string, "asc" | "desc">> }): Promise<SupplierMappingRecord[]>;
    findFirst(args: { where: { id?: string; shop: string; variantSnapshotId?: string } }): Promise<SupplierMappingRecord | null>;
    upsert(args: {
      where: { shop_variantSnapshotId: { shop: string; variantSnapshotId: string } };
      create: SupplierMappingRecord;
      update: Partial<SupplierMappingRecord>;
    }): Promise<SupplierMappingRecord>;
    update(args: { where: { id: string }; data: Partial<SupplierMappingRecord> }): Promise<SupplierMappingRecord>;
    delete(args: { where: { id: string } }): Promise<SupplierMappingRecord>;
  };
  variantSnapshot: {
    findMany(args: { where: { shop: string }; orderBy?: Array<Record<string, "asc" | "desc">> }): Promise<VariantSnapshot[]>;
    findFirst(args: { where: { id?: string; shop: string } }): Promise<VariantSnapshot | null>;
  };
  salesVelocity: {
    findMany(args: { where: { shop: string } }): Promise<SalesVelocityRecord[]>;
    upsert(args: {
      where: { shop_shopifyVariantId_windowDays: { shop: string; shopifyVariantId: string; windowDays: number } };
      create: SalesVelocityRecord;
      update: Partial<SalesVelocityRecord>;
    }): Promise<SalesVelocityRecord>;
  };
  recommendation: {
    findMany(args: { where: { shop: string }; orderBy?: Array<Record<string, "asc" | "desc">> }): Promise<RecommendationRecord[]>;
    upsert(args: {
      where: { shop_variantSnapshotId: { shop: string; variantSnapshotId: string } };
      create: RecommendationRecord;
      update: Partial<RecommendationRecord>;
    }): Promise<RecommendationRecord>;
  };
};

export async function listSuppliers(
  shop: string,
  prisma: SupplyChainClient,
): Promise<SupplierRecord[]> {
  return prisma.supplier.findMany({
    where: { shop, isActive: true },
    orderBy: [{ name: "asc" }],
  });
}

export async function createSupplier(
  shop: string,
  input: SupplierInput,
  prisma: SupplyChainClient,
): Promise<SupplierRecord> {
  if (!input.name?.trim()) {
    throw new SupplyChainError("invalid_supplier", "Supplier name is required", 400);
  }

  return prisma.supplier.create({
    data: normalizeSupplierInput(shop, input),
  });
}

export async function updateSupplier(
  shop: string,
  id: string,
  input: SupplierInput,
  prisma: SupplyChainClient,
): Promise<SupplierRecord> {
  await requireSupplier(shop, id, prisma);

  return prisma.supplier.update({
    where: { id },
    data: normalizeSupplierUpdate(input),
  });
}

export async function softDeleteSupplier(
  shop: string,
  id: string,
  prisma: SupplyChainClient,
): Promise<SupplierRecord> {
  await requireSupplier(shop, id, prisma);

  return prisma.supplier.update({
    where: { id },
    data: { isActive: false },
  });
}

export async function listSupplierMappings(
  shop: string,
  prisma: SupplyChainClient,
): Promise<SupplierMappingRecord[]> {
  return prisma.supplierMapping.findMany({
    where: { shop },
    orderBy: [{ updatedAt: "desc" }],
  });
}

export async function upsertSupplierMapping(
  shop: string,
  input: SupplierMappingInput,
  prisma: SupplyChainClient,
): Promise<SupplierMappingRecord> {
  const variantSnapshotId = requireInput(input.variantSnapshotId, "variantSnapshotId");
  const supplierId = requireInput(input.supplierId, "supplierId");
  const [variant, supplier] = await Promise.all([
    requireVariant(shop, variantSnapshotId, prisma),
    requireSupplier(shop, supplierId, prisma),
  ]);
  const create = normalizeMappingInput(shop, variant.id || variantSnapshotId, supplier, input);

  return prisma.supplierMapping.upsert({
    where: {
      shop_variantSnapshotId: {
        shop,
        variantSnapshotId,
      },
    },
    create,
    update: {
      supplierId,
      supplierSku: input.supplierSku ?? null,
      factoryLeadTimeDays: input.factoryLeadTimeDays ?? supplier.leadTimeDays,
      reorderBufferDays: input.reorderBufferDays ?? 7,
      moq: input.moq ?? supplier.moq ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function updateSupplierMapping(
  shop: string,
  id: string,
  input: SupplierMappingInput,
  prisma: SupplyChainClient,
): Promise<SupplierMappingRecord> {
  const existing = await requireMapping(shop, id, prisma);
  const supplier = input.supplierId
    ? await requireSupplier(shop, input.supplierId, prisma)
    : null;

  if (input.variantSnapshotId) {
    await requireVariant(shop, input.variantSnapshotId, prisma);
  }

  return prisma.supplierMapping.update({
    where: { id },
    data: {
      variantSnapshotId: input.variantSnapshotId ?? existing.variantSnapshotId,
      supplierId: input.supplierId ?? existing.supplierId,
      supplierSku: input.supplierSku ?? existing.supplierSku,
      factoryLeadTimeDays:
        input.factoryLeadTimeDays ?? supplier?.leadTimeDays ?? existing.factoryLeadTimeDays,
      reorderBufferDays: input.reorderBufferDays ?? existing.reorderBufferDays,
      moq: input.moq ?? supplier?.moq ?? existing.moq,
      notes: input.notes ?? existing.notes,
    },
  });
}

export async function deleteSupplierMapping(
  shop: string,
  id: string,
  prisma: SupplyChainClient,
): Promise<SupplierMappingRecord> {
  await requireMapping(shop, id, prisma);

  return prisma.supplierMapping.delete({
    where: { id },
  });
}

export async function generateRecommendationsForShop(
  shop: string,
  prisma: SupplyChainClient,
  now = new Date(),
): Promise<GenerateRecommendationsResult> {
  const [variants, mappings, velocities] = await Promise.all([
    prisma.variantSnapshot.findMany({ where: { shop } }),
    prisma.supplierMapping.findMany({ where: { shop } }),
    prisma.salesVelocity.findMany({ where: { shop } }),
  ]);
  const mappingsByVariant = new Map(mappings.map((mapping) => [mapping.variantSnapshotId, mapping]));
  const velocitiesByVariant = new Map(
    velocities.map((velocity) => [velocity.variantSnapshotId, velocity]),
  );
  const recommendations: RecommendationRecord[] = [];
  let skippedCount = 0;

  for (const variant of variants) {
    if (isGiftCardVariant(variant)) {
      skippedCount += 1;
      continue;
    }

    const variantSnapshotId = variant.id || variant.shopifyVariantId;
    const mapping = mappingsByVariant.get(variantSnapshotId);
    const velocity = velocitiesByVariant.get(variantSnapshotId);
    const recommendation = buildRecommendation(shop, variant, mapping, velocity, now);
    const saved = await prisma.recommendation.upsert({
      where: {
        shop_variantSnapshotId: {
          shop,
          variantSnapshotId,
        },
      },
      create: recommendation,
      update: {
        supplierId: recommendation.supplierId,
        currentInventory: recommendation.currentInventory,
        estimatedDailySales: recommendation.estimatedDailySales,
        inventoryCoverDays: recommendation.inventoryCoverDays,
        stockoutDate: recommendation.stockoutDate,
        latestReorderDate: recommendation.latestReorderDate,
        riskLevel: recommendation.riskLevel,
        reason: recommendation.reason,
      },
    });

    recommendations.push(saved);
  }

  return {
    generatedCount: recommendations.length,
    skippedCount,
    recommendations: sortRecommendations(recommendations),
  };
}

export async function listRecommendations(
  shop: string,
  prisma: SupplyChainClient,
): Promise<RecommendationRecord[]> {
  return sortRecommendations(await prisma.recommendation.findMany({ where: { shop } }));
}

export async function listReorderQueue(
  shop: string,
  prisma: SupplyChainClient,
): Promise<ReorderQueueItem[]> {
  const [recommendations, variants] = await Promise.all([
    listRecommendations(shop, prisma),
    prisma.variantSnapshot.findMany({ where: { shop } }),
  ]);
  const variantsById = new Map(variants.map((variant) => [variant.id || variant.shopifyVariantId, variant]));

  return recommendations
    .filter((item) => {
      return (
        item.estimatedDailySales !== null &&
        item.inventoryCoverDays !== null &&
        item.latestReorderDate !== null
      );
    })
    .map((item) => {
      const variant = variantsById.get(item.variantSnapshotId);

      return {
        sku: variant?.sku || null,
        productTitle: variant?.productTitle || item.variantSnapshotId,
        variantTitle: variant?.title || "",
        inventory: item.currentInventory,
        estimatedDailySales: item.estimatedDailySales || 0,
        inventoryCoverDays: item.inventoryCoverDays || 0,
        recommendedReorderDate: item.latestReorderDate || "",
        riskLevel: item.riskLevel,
      };
    })
    .sort((left, right) => {
      return (
        new Date(left.recommendedReorderDate).getTime() -
        new Date(right.recommendedReorderDate).getTime()
      );
    });
}

function buildRecommendation(
  shop: string,
  variant: VariantSnapshot,
  mapping: SupplierMappingRecord | undefined,
  velocity: SalesVelocityRecord | undefined,
  now: Date,
): RecommendationRecord {
  const variantSnapshotId = variant.id || variant.shopifyVariantId;

  if (variant.inventoryQuantity <= 0) {
    return baseRecommendation(shop, variantSnapshotId, mapping, variant.inventoryQuantity, {
      riskLevel: "out_of_stock",
      reason: "out_of_stock",
    });
  }

  if (!mapping) {
    return baseRecommendation(shop, variantSnapshotId, mapping, variant.inventoryQuantity, {
      riskLevel: "pending_supplier_mapping",
      reason: "needs_supplier_mapping",
    });
  }

  if (!velocity || velocity.estimatedDailySales <= 0) {
    return baseRecommendation(shop, variantSnapshotId, mapping, variant.inventoryQuantity, {
      riskLevel: "pending_sales_data",
      reason: "needs_sales_velocity",
    });
  }

  const recommendation = calculateReorderRecommendation(
    {
      shopifyVariantId: variant.shopifyVariantId,
      productTitle: variant.productTitle,
      variantTitle: variant.title,
      sku: variant.sku || undefined,
      inventoryQuantity: variant.inventoryQuantity,
      unitsPerDay: velocity.estimatedDailySales,
    },
    {
      supplierId: mapping.supplierId,
      productionLeadTimeDays: mapping.factoryLeadTimeDays,
      shippingLeadTimeDays: 0,
      bufferDays: mapping.reorderBufferDays,
    },
    [],
    now,
  );

  return {
    shop,
    variantSnapshotId,
    supplierId: mapping.supplierId,
    currentInventory: variant.inventoryQuantity,
    estimatedDailySales: velocity.estimatedDailySales,
    inventoryCoverDays: recommendation.inventoryCoverageDays,
    stockoutDate: recommendation.estimatedStockoutDate,
    latestReorderDate: recommendation.latestReorderDate,
    riskLevel: recommendation.riskLevel,
    reason: "calculated_from_sales_velocity",
  };
}

function baseRecommendation(
  shop: string,
  variantSnapshotId: string,
  mapping: SupplierMappingRecord | undefined,
  currentInventory: number,
  status: { riskLevel: string; reason: string },
): RecommendationRecord {
  return {
    shop,
    variantSnapshotId,
    supplierId: mapping?.supplierId || null,
    currentInventory,
    estimatedDailySales: null,
    inventoryCoverDays: null,
    stockoutDate: null,
    latestReorderDate: null,
    riskLevel: status.riskLevel,
    reason: status.reason,
  };
}

function normalizeSupplierInput(shop: string, input: SupplierInput): SupplierRecord {
  return {
    shop,
    name: input.name?.trim() || "",
    country: input.country || "China",
    province: input.province ?? null,
    city: input.city ?? null,
    contactName: input.contactName ?? null,
    contactEmail: input.contactEmail ?? null,
    contactPhone: input.contactPhone ?? null,
    wechat: input.wechat ?? null,
    whatsapp: input.whatsapp ?? null,
    leadTimeDays: input.leadTimeDays ?? 14,
    moq: input.moq ?? null,
    notes: input.notes ?? null,
    riskLevel: input.riskLevel || "unknown",
    isActive: input.isActive ?? true,
  };
}

function normalizeSupplierUpdate(input: SupplierInput): Partial<SupplierRecord> {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.country !== undefined ? { country: input.country } : {}),
    ...(input.province !== undefined ? { province: input.province } : {}),
    ...(input.city !== undefined ? { city: input.city } : {}),
    ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
    ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
    ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
    ...(input.wechat !== undefined ? { wechat: input.wechat } : {}),
    ...(input.whatsapp !== undefined ? { whatsapp: input.whatsapp } : {}),
    ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
    ...(input.moq !== undefined ? { moq: input.moq } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.riskLevel !== undefined ? { riskLevel: input.riskLevel } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  };
}

function normalizeMappingInput(
  shop: string,
  variantSnapshotId: string,
  supplier: SupplierRecord,
  input: SupplierMappingInput,
): SupplierMappingRecord {
  return {
    shop,
    variantSnapshotId,
    supplierId: supplier.id || requireInput(input.supplierId, "supplierId"),
    supplierSku: input.supplierSku ?? null,
    factoryLeadTimeDays: input.factoryLeadTimeDays ?? supplier.leadTimeDays,
    reorderBufferDays: input.reorderBufferDays ?? 7,
    moq: input.moq ?? supplier.moq ?? null,
    notes: input.notes ?? null,
  };
}

async function requireSupplier(
  shop: string,
  id: string,
  prisma: SupplyChainClient,
): Promise<SupplierRecord> {
  const supplier = await prisma.supplier.findFirst({
    where: { id, shop, isActive: true },
  });

  if (!supplier) {
    throw new SupplyChainError("supplier_not_found", "Supplier was not found", 404);
  }

  return supplier;
}

async function requireMapping(
  shop: string,
  id: string,
  prisma: SupplyChainClient,
): Promise<SupplierMappingRecord> {
  const mapping = await prisma.supplierMapping.findFirst({
    where: { id, shop },
  });

  if (!mapping) {
    throw new SupplyChainError("mapping_not_found", "Supplier mapping was not found", 404);
  }

  return mapping;
}

async function requireVariant(
  shop: string,
  id: string,
  prisma: SupplyChainClient,
): Promise<VariantSnapshot> {
  const variant = await prisma.variantSnapshot.findFirst({
    where: { id, shop },
  });

  if (!variant) {
    throw new SupplyChainError("variant_not_found", "Variant snapshot was not found", 404);
  }

  return variant;
}

function requireInput(value: string | undefined, name: string): string {
  if (!value) {
    throw new SupplyChainError("invalid_input", `${name} is required`, 400);
  }

  return value;
}

function isGiftCardVariant(variant: VariantSnapshot): boolean {
  return `${variant.productTitle} ${variant.title}`.toLowerCase().includes("gift card");
}

function sortRecommendations(recommendations: RecommendationRecord[]): RecommendationRecord[] {
  const riskOrder = new Map([
    ["out_of_stock", 0],
    ["critical", 1],
    ["high", 2],
    ["medium", 3],
    ["pending_supplier_mapping", 4],
    ["pending_sales_data", 5],
    ["low", 6],
  ]);

  return [...recommendations].sort((left, right) => {
    const riskCompare =
      (riskOrder.get(left.riskLevel) ?? 99) - (riskOrder.get(right.riskLevel) ?? 99);

    if (riskCompare !== 0) {
      return riskCompare;
    }

    const leftDate = left.latestReorderDate ? new Date(left.latestReorderDate).getTime() : Infinity;
    const rightDate = right.latestReorderDate ? new Date(right.latestReorderDate).getTime() : Infinity;

    return leftDate - rightDate;
  });
}

export class SupplyChainError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "SupplyChainError";
    this.code = code;
    this.status = status;
  }
}
