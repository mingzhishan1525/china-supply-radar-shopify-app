import {
  createShopifyAdminClient,
  type ShopifyGraphqlClient,
} from "../shopify/adminClient.ts";
import { ORDERS_FOR_SALES_VELOCITY_QUERY } from "../shopify/queries.ts";
import type { SessionStore } from "./sessionStore.ts";
import type { SupplyChainClient } from "./supplyChain.ts";

const allowedWindowDays = new Set([7, 14, 30, 60, 90]);

export type SyncOrdersResult = {
  ordersScanned: number;
  lineItemsScanned: number;
  variantsUpdated: number;
  matchedVariants: number;
  unmatchedLineItems: number;
  skippedCount: number;
  lastOrderCreatedAt: string | null;
  syncStartedAt: string;
  syncFinishedAt: string;
  windowDays: number;
  calculatedFrom: string;
  calculatedTo: string;
};

type OrdersResponse = {
  orders: {
    pageInfo?: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    nodes: Array<{
      id: string;
      createdAt: string;
      cancelledAt: string | null;
      lineItems: {
        nodes: Array<{
          quantity: number;
          variant: { id: string } | null;
          title?: string | null;
          name?: string | null;
        }>;
      };
    }>;
  };
};

export function parseWindowDays(value: string | null): number {
  if (!value) {
    return 30;
  }

  const windowDays = Number(value);

  if (!allowedWindowDays.has(windowDays)) {
    throw new OrdersSyncError(
      "invalid_window_days",
      "windowDays must be one of 7, 14, 30, 60, or 90",
      400,
    );
  }

  return windowDays;
}

export async function syncOrdersAndSalesVelocityForShop(
  shop: string,
  deps: {
    sessionStore: SessionStore;
    prisma: SupplyChainClient;
    graphqlClient?: ShopifyGraphqlClient;
    windowDays?: number;
    now?: Date;
  },
): Promise<SyncOrdersResult> {
  const syncStartedAt = deps.now || new Date();
  const windowDays = deps.windowDays ?? 30;

  if (!allowedWindowDays.has(windowDays)) {
    throw new OrdersSyncError(
      "invalid_window_days",
      "windowDays must be one of 7, 14, 30, 60, or 90",
      400,
    );
  }

  const session = await deps.sessionStore.load(shop);

  if (!session?.scope.split(",").map((scope) => scope.trim()).includes("read_orders")) {
    throw new OrdersSyncError(
      "missing_read_orders_scope",
      "read_orders scope is required. Reinstall the app after adding read_orders.",
      403,
    );
  }

  const now = syncStartedAt;
  const calculatedTo = now;
  const calculatedFrom = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const graphqlClient =
    deps.graphqlClient || (await createShopifyAdminClient(shop, deps.sessionStore));
  const orders = await fetchOrdersForSalesVelocity(graphqlClient, calculatedFrom);
  const variants = await deps.prisma.variantSnapshot.findMany({ where: { shop } });
  const variantsByShopifyId = new Map(variants.map((variant) => [variant.shopifyVariantId, variant]));
  const unitsByVariant = new Map<string, number>();
  let ordersScanned = 0;
  let lineItemsScanned = 0;
  let skippedCount = 0;
  let unmatchedLineItems = 0;
  let lastOrderCreatedAt: string | null = null;

  for (const order of orders) {
    if (order.cancelledAt) {
      skippedCount += 1;
      continue;
    }

    ordersScanned += 1;
    lastOrderCreatedAt = maxIsoDate(lastOrderCreatedAt, order.createdAt);

    for (const lineItem of order.lineItems.nodes) {
      lineItemsScanned += 1;
      const variantId = lineItem.variant?.id;
      const snapshot = variantId ? variantsByShopifyId.get(variantId) : null;

      if (!variantId || !snapshot || isGiftCardLineItem(lineItem.title, lineItem.name, snapshot.productTitle)) {
        skippedCount += 1;
        unmatchedLineItems += 1;
        continue;
      }

      unitsByVariant.set(variantId, (unitsByVariant.get(variantId) || 0) + lineItem.quantity);
    }
  }

  for (const [shopifyVariantId, unitsSold] of unitsByVariant) {
    const snapshot = variantsByShopifyId.get(shopifyVariantId);

    if (!snapshot?.id) {
      skippedCount += 1;
      continue;
    }

    await deps.prisma.salesVelocity.upsert({
      where: {
        shop_shopifyVariantId_windowDays: {
          shop,
          shopifyVariantId,
          windowDays,
        },
      },
      create: {
        shop,
        shopifyVariantId,
        variantSnapshotId: snapshot.id,
        unitsSold,
        windowDays,
        estimatedDailySales: unitsSold / windowDays,
        calculatedFrom,
        calculatedTo,
      },
      update: {
        variantSnapshotId: snapshot.id,
        unitsSold,
        estimatedDailySales: unitsSold / windowDays,
        calculatedFrom,
        calculatedTo,
      },
    });
  }

  return {
    ordersScanned,
    lineItemsScanned,
    variantsUpdated: unitsByVariant.size,
    matchedVariants: unitsByVariant.size,
    unmatchedLineItems,
    skippedCount,
    lastOrderCreatedAt,
    syncStartedAt: syncStartedAt.toISOString(),
    syncFinishedAt: (deps.now || new Date()).toISOString(),
    windowDays,
    calculatedFrom: calculatedFrom.toISOString(),
    calculatedTo: calculatedTo.toISOString(),
  };
}

async function fetchOrdersForSalesVelocity(
  graphqlClient: ShopifyGraphqlClient,
  calculatedFrom: Date,
): Promise<OrdersResponse["orders"]["nodes"]> {
  const orders: OrdersResponse["orders"]["nodes"] = [];
  let after: string | null = null;

  while (true) {
    const payload: OrdersResponse = await graphqlClient.graphql<OrdersResponse>(
      ORDERS_FOR_SALES_VELOCITY_QUERY,
      {
        first: 100,
        after,
        lineItemsFirst: 100,
        query: `created_at:>=${calculatedFrom.toISOString().slice(0, 10)}`,
      },
    );

    orders.push(...payload.orders.nodes);

    if (!payload.orders.pageInfo?.hasNextPage || !payload.orders.pageInfo.endCursor) {
      return orders;
    }

    after = payload.orders.pageInfo.endCursor;
  }
}

export async function listSalesVelocityForShop(
  shop: string,
  prisma: SupplyChainClient,
) {
  return prisma.salesVelocity.findMany({ where: { shop } });
}

function isGiftCardLineItem(...values: Array<string | null | undefined>): boolean {
  return values.filter(Boolean).join(" ").toLowerCase().includes("gift card");
}

function maxIsoDate(left: string | null, right: string): string {
  if (!left) {
    return right;
  }

  return new Date(right).getTime() > new Date(left).getTime() ? right : left;
}

export class OrdersSyncError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "OrdersSyncError";
    this.code = code;
    this.status = status;
  }
}
