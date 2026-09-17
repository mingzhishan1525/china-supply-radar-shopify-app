import type { SessionStore } from "./sessionStore.ts";
import {
  createShopifyAdminClient,
  type ShopifyGraphqlClient,
} from "../shopify/adminClient.ts";
import { nextCursor, type PageInfo } from "../shopify/pagination.ts";
import { PRODUCTS_FOR_SYNC_QUERY, PRODUCT_VARIANTS_PAGE_QUERY } from "../shopify/queries.ts";

export type VariantSnapshot = {
  id?: string;
  shop: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  sku: string | null;
  title: string;
  productTitle: string;
  price: string | null;
  inventoryQuantity: number;
  shopifyUpdatedAt: Date | string | null;
  syncedAt?: Date | string;
  updatedAt?: Date | string;
};

export type SyncProductsResult = {
  syncedCount: number;
  skippedCount: number;
  errorCount: number;
  lastSyncedAt: string;
};

export type VariantSnapshotPrismaClient = {
  variantSnapshot: {
    upsert(args: {
      where: { shop_shopifyVariantId: { shop: string; shopifyVariantId: string } };
      create: VariantSnapshot;
      update: VariantSnapshotUpdate;
    }): Promise<VariantSnapshot>;
    findMany(args: {
      where: { shop: string };
      orderBy?: Array<Record<string, "asc" | "desc">>;
    }): Promise<VariantSnapshot[]>;
  };
};

type VariantSnapshotUpdate = {
  shopifyProductId: string;
  sku: string | null;
  title: string;
  productTitle: string;
  price: string | null;
  inventoryQuantity: number;
  shopifyUpdatedAt: Date | string | null;
  syncedAt: Date;
};

type ProductSyncResponse = {
  products: {
    pageInfo?: PageInfo;
    nodes: Array<{
      id: string;
      title: string;
      updatedAt?: string;
      variants: {
        pageInfo?: PageInfo;
        nodes: Array<{
          id: string;
          title: string;
          sku: string | null;
          price: string | null;
          inventoryQuantity: number | null;
          updatedAt?: string;
        }>;
      };
    }>;
  };
};

export async function syncProductsForShop(
  shop: string,
  deps: {
    sessionStore: SessionStore;
    prisma: VariantSnapshotPrismaClient;
    graphqlClient?: ShopifyGraphqlClient;
    now?: Date;
  },
): Promise<SyncProductsResult> {
  const graphqlClient =
    deps.graphqlClient || (await createShopifyAdminClient(shop, deps.sessionStore));
  const syncedAt = deps.now || new Date();
  let syncedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  let after: string | null = null;
  const productCursors = new Set<string>();
  do {
    const payload: ProductSyncResponse = await graphqlClient.graphql(PRODUCTS_FOR_SYNC_QUERY, { first: 25, variantsFirst: 25, after });
    for (const product of payload.products.nodes) {
      const variantCursors = new Set<string>();
      let variantAfter = nextCursor(product.variants.pageInfo, variantCursors);
      while (variantAfter) {
        const more = await graphqlClient.graphql<{ product: { variants: typeof product.variants } | null }>(PRODUCT_VARIANTS_PAGE_QUERY, { id: product.id, after: variantAfter });
        if (!more.product) throw new Error("Product changed during sync. Please retry.");
        product.variants.nodes.push(...more.product.variants.nodes);
        variantAfter = nextCursor(more.product.variants.pageInfo, variantCursors);
      }
      for (const variant of product.variants.nodes) {
        if (!variant.id || !product.id) {
          skippedCount += 1;
          continue;
        }

        try {
          await deps.prisma.variantSnapshot.upsert({
            where: {
              shop_shopifyVariantId: {
                shop,
                shopifyVariantId: variant.id,
              },
            },
            create: {
              shop,
              shopifyProductId: product.id,
              shopifyVariantId: variant.id,
              sku: variant.sku || null,
              title: variant.title || "Default",
              productTitle: product.title || "Untitled product",
              price: variant.price || null,
              inventoryQuantity: variant.inventoryQuantity ?? 0,
              shopifyUpdatedAt: variant.updatedAt || product.updatedAt || null,
              syncedAt,
            },
            update: {
              shopifyProductId: product.id,
              sku: variant.sku || null,
              title: variant.title || "Default",
              productTitle: product.title || "Untitled product",
              price: variant.price || null,
              inventoryQuantity: variant.inventoryQuantity ?? 0,
              shopifyUpdatedAt: variant.updatedAt || product.updatedAt || null,
              syncedAt,
            },
          });
          syncedCount += 1;
        } catch {
          errorCount += 1;
        }
      }
    }

    after = nextCursor(payload.products.pageInfo, productCursors);
  } while (after);
  if (errorCount || skippedCount) throw new ProductSyncError(syncedCount, errorCount, skippedCount);
  return {
    syncedCount,
    skippedCount,
    errorCount,
    lastSyncedAt: syncedAt.toISOString(),
  };
}

export async function syncInventoryForShop(
  shop: string,
  deps: {
    sessionStore: SessionStore;
    prisma: VariantSnapshotPrismaClient;
    graphqlClient?: ShopifyGraphqlClient;
    now?: Date;
  },
): Promise<SyncProductsResult> {
  return syncProductsForShop(shop, deps);
}

export async function listVariantSnapshotsForShop(
  shop: string,
  prisma: VariantSnapshotPrismaClient,
): Promise<VariantSnapshot[]> {
  return prisma.variantSnapshot.findMany({
    where: { shop },
    orderBy: [{ productTitle: "asc" }, { title: "asc" }],
  });
}

export class ProductSyncError extends Error {
  readonly status = 503;
  readonly code = "product_sync_incomplete";
  readonly syncedCount: number;
  readonly errorCount: number;
  readonly skippedCount: number;
  constructor(syncedCount: number, errorCount: number, skippedCount: number) {
    super(`Product sync is incomplete: ${syncedCount} saved, ${errorCount} failed, ${skippedCount} skipped. Please retry sync.`);
    this.syncedCount = syncedCount;
    this.errorCount = errorCount;
    this.skippedCount = skippedCount;
  }
}
