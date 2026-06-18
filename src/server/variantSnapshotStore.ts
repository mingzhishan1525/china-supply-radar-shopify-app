import type {
  VariantSnapshot,
  VariantSnapshotPrismaClient,
} from "./productSync.ts";

export class MemoryVariantSnapshotStore implements VariantSnapshotPrismaClient {
  private readonly rows = new Map<string, VariantSnapshot>();

  readonly variantSnapshot = {
    upsert: async (args: Parameters<VariantSnapshotPrismaClient["variantSnapshot"]["upsert"]>[0]) => {
      const key = snapshotKey(
        args.where.shop_shopifyVariantId.shop,
        args.where.shop_shopifyVariantId.shopifyVariantId,
      );
      const previous = this.rows.get(key);
      const now = new Date().toISOString();
      const next: VariantSnapshot = previous
        ? {
            ...previous,
            ...args.update,
            updatedAt: now,
          }
        : {
            ...args.create,
            id: `variant_${this.rows.size + 1}`,
            updatedAt: now,
          };

      this.rows.set(key, next);
      return next;
    },
    findMany: async (args: Parameters<VariantSnapshotPrismaClient["variantSnapshot"]["findMany"]>[0]) => {
      return Array.from(this.rows.values())
        .filter((row) => row.shop === args.where.shop)
        .sort((left, right) => {
          const productCompare = left.productTitle.localeCompare(right.productTitle);

          if (productCompare !== 0) {
            return productCompare;
          }

          return left.title.localeCompare(right.title);
        });
    },
  };
}

function snapshotKey(shop: string, shopifyVariantId: string): string {
  return `${shop}::${shopifyVariantId}`;
}
