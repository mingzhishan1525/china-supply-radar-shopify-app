import type { VariantSnapshot } from "./productSync.ts";
import type {
  RecommendationRecord,
  SalesVelocityRecord,
  SupplierMappingRecord,
  SupplierRecord,
  SupplyChainClient,
} from "./supplyChain.ts";

export class MemorySupplyChainStore implements SupplyChainClient {
  private readonly suppliers = new Map<string, SupplierRecord>();
  private readonly mappings = new Map<string, SupplierMappingRecord>();
  private readonly recommendations = new Map<string, RecommendationRecord>();
  private readonly velocities = new Map<string, SalesVelocityRecord>();
  private readonly variants = new Map<string, VariantSnapshot>();

  readonly supplier = {
    findMany: async (args: Parameters<SupplyChainClient["supplier"]["findMany"]>[0]) => {
      return Array.from(this.suppliers.values())
        .filter((row) => row.shop === args.where.shop)
        .filter((row) => args.where.isActive === undefined || row.isActive === args.where.isActive)
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    findFirst: async (args: Parameters<SupplyChainClient["supplier"]["findFirst"]>[0]) => {
      return Array.from(this.suppliers.values()).find((row) => {
        return (
          row.shop === args.where.shop &&
          (!args.where.id || row.id === args.where.id) &&
          (args.where.isActive === undefined || row.isActive === args.where.isActive)
        );
      }) || null;
    },
    create: async (args: Parameters<SupplyChainClient["supplier"]["create"]>[0]) => {
      const row = withTimestamps({
        ...args.data,
        id: `supplier_${this.suppliers.size + 1}`,
      });
      this.suppliers.set(row.id || "", row);
      return row;
    },
    update: async (args: Parameters<SupplyChainClient["supplier"]["update"]>[0]) => {
      const previous = this.requireRow(this.suppliers, args.where.id);
      const row = withTimestamps({ ...previous, ...args.data, updatedAt: new Date().toISOString() });
      this.suppliers.set(args.where.id, row);
      return row;
    },
    deleteMany: async (args: { where: { shop: string } }) => deleteRowsForShop(this.suppliers, args.where.shop),
  };

  readonly supplierMapping = {
    findMany: async (args: Parameters<SupplyChainClient["supplierMapping"]["findMany"]>[0]) => {
      return Array.from(this.mappings.values())
        .filter((row) => row.shop === args.where.shop)
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    },
    findFirst: async (args: Parameters<SupplyChainClient["supplierMapping"]["findFirst"]>[0]) => {
      return Array.from(this.mappings.values()).find((row) => {
        return (
          row.shop === args.where.shop &&
          (!args.where.id || row.id === args.where.id) &&
          (!args.where.variantSnapshotId || row.variantSnapshotId === args.where.variantSnapshotId)
        );
      }) || null;
    },
    upsert: async (args: Parameters<SupplyChainClient["supplierMapping"]["upsert"]>[0]) => {
      const key = mappingKey(
        args.where.shop_variantSnapshotId.shop,
        args.where.shop_variantSnapshotId.variantSnapshotId,
      );
      const previous = this.mappings.get(key);
      const row = withTimestamps(
        previous
          ? { ...previous, ...args.update, updatedAt: new Date().toISOString() }
          : { ...args.create, id: `mapping_${this.mappings.size + 1}` },
      );
      this.mappings.set(key, row);
      return row;
    },
    update: async (args: Parameters<SupplyChainClient["supplierMapping"]["update"]>[0]) => {
      const previous = Array.from(this.mappings.values()).find((row) => row.id === args.where.id);

      if (!previous) {
        throw new Error("Record not found");
      }

      const row = withTimestamps({ ...previous, ...args.data, updatedAt: new Date().toISOString() });
      this.mappings.delete(mappingKey(previous.shop, previous.variantSnapshotId));
      this.mappings.set(mappingKey(row.shop, row.variantSnapshotId), row);
      return row;
    },
    delete: async (args: Parameters<SupplyChainClient["supplierMapping"]["delete"]>[0]) => {
      const previous = Array.from(this.mappings.values()).find((row) => row.id === args.where.id);

      if (!previous) {
        throw new Error("Record not found");
      }

      this.mappings.delete(mappingKey(previous.shop, previous.variantSnapshotId));
      return previous;
    },
    deleteMany: async (args: { where: { shop: string } }) => deleteRowsForShop(this.mappings, args.where.shop),
  };

  readonly variantSnapshot = {
    findMany: async (args: Parameters<SupplyChainClient["variantSnapshot"]["findMany"]>[0]) => {
      return Array.from(this.variants.values()).filter((row) => row.shop === args.where.shop);
    },
    findFirst: async (args: Parameters<SupplyChainClient["variantSnapshot"]["findFirst"]>[0]) => {
      return Array.from(this.variants.values()).find((row) => {
        return row.shop === args.where.shop && (!args.where.id || row.id === args.where.id);
      }) || null;
    },
    deleteMany: async (args: { where: { shop: string } }) => deleteRowsForShop(this.variants, args.where.shop),
  };

  readonly salesVelocity = {
    findMany: async (args: Parameters<SupplyChainClient["salesVelocity"]["findMany"]>[0]) => {
      return Array.from(this.velocities.values()).filter((row) => row.shop === args.where.shop);
    },
    upsert: async (args: Parameters<SupplyChainClient["salesVelocity"]["upsert"]>[0]) => {
      const key = velocityKey(
        args.where.shop_shopifyVariantId_windowDays.shop,
        args.where.shop_shopifyVariantId_windowDays.shopifyVariantId,
        args.where.shop_shopifyVariantId_windowDays.windowDays,
      );
      const previous = this.velocities.get(key);
      const row = withTimestamps(
        previous
          ? { ...previous, ...args.update, updatedAt: new Date().toISOString() }
          : { ...args.create, id: `velocity_${this.velocities.size + 1}` },
      );
      this.velocities.set(key, row);
      return row;
    },
    deleteMany: async (args: { where: { shop: string } }) => deleteRowsForShop(this.velocities, args.where.shop),
  };

  readonly recommendation = {
    findMany: async (args: Parameters<SupplyChainClient["recommendation"]["findMany"]>[0]) => {
      return Array.from(this.recommendations.values()).filter((row) => row.shop === args.where.shop);
    },
    upsert: async (args: Parameters<SupplyChainClient["recommendation"]["upsert"]>[0]) => {
      const key = recommendationKey(
        args.where.shop_variantSnapshotId.shop,
        args.where.shop_variantSnapshotId.variantSnapshotId,
      );
      const previous = this.recommendations.get(key);
      const row = withTimestamps(
        previous
          ? { ...previous, ...args.update, updatedAt: new Date().toISOString() }
          : { ...args.create, id: `recommendation_${this.recommendations.size + 1}` },
      );
      this.recommendations.set(key, row);
      return row;
    },
    deleteMany: async (args: { where: { shop: string } }) => deleteRowsForShop(this.recommendations, args.where.shop),
  };

  addVariant(variant: VariantSnapshot): VariantSnapshot {
    const row = {
      ...variant,
      id: variant.id || `variant_${this.variants.size + 1}`,
    };
    this.variants.set(row.id || "", row);
    return row;
  }

  addSalesVelocity(velocity: SalesVelocityRecord): SalesVelocityRecord {
    const row = {
      ...velocity,
      id: velocity.id || `velocity_${this.velocities.size + 1}`,
    };
    this.velocities.set(velocityKey(row.shop, row.shopifyVariantId, row.windowDays), row);
    return row;
  }

  private requireRow<T extends { id?: string }>(rows: Map<string, T>, id: string): T {
    const row = rows.get(id);

    if (!row) {
      throw new Error("Record not found");
    }

    return row;
  }
}

function mappingKey(shop: string, variantSnapshotId: string): string {
  return `${shop}::${variantSnapshotId}`;
}

function recommendationKey(shop: string, variantSnapshotId: string): string {
  return `${shop}::${variantSnapshotId}`;
}

function velocityKey(shop: string, shopifyVariantId: string, windowDays: number): string {
  return `${shop}::${shopifyVariantId}::${windowDays}`;
}

function withTimestamps<T extends { createdAt?: Date | string; updatedAt?: Date | string }>(row: T): T {
  const now = new Date().toISOString();

  return {
    ...row,
    createdAt: row.createdAt || now,
    updatedAt: row.updatedAt || now,
  };
}

function deleteRowsForShop<T extends { shop: string }>(
  rows: Map<string, T>,
  shop: string,
): Promise<{ count: number }> {
  let count = 0;

  for (const [key, row] of rows.entries()) {
    if (row.shop === shop) {
      rows.delete(key);
      count += 1;
    }
  }

  return Promise.resolve({ count });
}
