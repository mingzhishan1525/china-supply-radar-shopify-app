import type { SessionStore } from "./sessionStore.ts";
import {
  createShopifyAdminClient,
  type ShopifyGraphqlClient,
} from "../shopify/adminClient.ts";
import { PRODUCTS_FOR_SYNC_QUERY } from "../shopify/queries.ts";

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
    nodes: Array<{
      id: string;
      title: string;
      updatedAt?: string;
      variants: {
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
  const payload = await graphqlClient.graphql<ProductSyncResponse>(
    PRODUCTS_FOR_SYNC_QUERY,
    {
      first: 50,
      variantsFirst: 50,
    },
  );
  const syncedAt = deps.now || new Date();
  let syncedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const product of payload.products.nodes) {
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
