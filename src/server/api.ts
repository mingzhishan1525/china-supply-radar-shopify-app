import { ShopifyAdminError } from "../shopify/adminClient.ts";
import { verifyShopifySessionToken } from "../security/shopifySessionToken.ts";
import type { AppConfig } from "./config.ts";
import {
  listVariantSnapshotsForShop,
  syncProductsForShop,
  type VariantSnapshotPrismaClient,
} from "./productSync.ts";
import {
  listSalesVelocityForShop,
  OrdersSyncError,
  parseWindowDays,
  syncOrdersAndSalesVelocityForShop,
} from "./ordersSync.ts";
import type { SessionStore } from "./sessionStore.ts";
import {
  createSupplier,
  deleteSupplierMapping,
  generateRecommendationsForShop,
  listRecommendations,
  listReorderQueue,
  listSupplierMappings,
  listSuppliers,
  softDeleteSupplier,
  SupplyChainError,
  type SupplyChainClient,
  updateSupplier,
  updateSupplierMapping,
  upsertSupplierMapping,
} from "./supplyChain.ts";

export type ApiResponse = {
  status: number;
  body: unknown;
};

export type ApiDeps = {
  sessionStore: SessionStore;
  prisma: VariantSnapshotPrismaClient;
  supplyChain: SupplyChainClient;
  config?: AppConfig;
  authorizationHeader?: string | null;
};

export async function handleApiRequest(
  method: string,
  path: string,
  query: URLSearchParams,
  deps: ApiDeps,
  body: unknown = {},
): Promise<ApiResponse> {
  try {
    if (method === "GET" && path === "/api/shop") {
      const session = await requireInstalledShop(query, deps);

      return {
        status: 200,
        body: {
          shop: session.shop,
          scope: session.scope,
          isInstalled: session.isInstalled,
          installedAt: session.installedAt,
          uninstalledAt: session.uninstalledAt,
        },
      };
    }

    if (method === "GET" && path === "/api/products") {
      const session = await requireInstalledShop(query, deps);
      const products = await listVariantSnapshotsForShop(session.shop, deps.prisma);

      return {
        status: 200,
        body: {
          shop: session.shop,
          products,
        },
      };
    }

    if (method === "POST" && path === "/api/sync/products") {
      const session = await requireInstalledShop(query, deps);
      const result = await syncProductsForShop(session.shop, deps);

      return {
        status: 200,
        body: result,
      };
    }

    if (method === "POST" && path === "/api/sync/orders") {
      const session = await requireInstalledShop(query, deps);
      const windowDays = parseWindowDays(query.get("windowDays"));
      const result = await syncOrdersAndSalesVelocityForShop(session.shop, {
        sessionStore: deps.sessionStore,
        prisma: deps.supplyChain,
        windowDays,
      });

      return {
        status: 200,
        body: result,
      };
    }

    if (method === "GET" && path === "/api/sales-velocity") {
      const session = await requireInstalledShop(query, deps);

      return {
        status: 200,
        body: {
          shop: session.shop,
          salesVelocity: await listSalesVelocityForShop(session.shop, deps.supplyChain),
        },
      };
    }

    if (path === "/api/suppliers") {
      const session = await requireInstalledShop(query, deps);

      if (method === "GET") {
        return { status: 200, body: { shop: session.shop, suppliers: await listSuppliers(session.shop, deps.supplyChain) } };
      }

      if (method === "POST") {
        return { status: 201, body: await createSupplier(session.shop, body as Record<string, unknown>, deps.supplyChain) };
      }
    }

    const supplierMatch = path.match(/^\/api\/suppliers\/([^/]+)$/);

    if (supplierMatch) {
      const session = await requireInstalledShop(query, deps);
      const id = decodeURIComponent(supplierMatch[1]);

      if (method === "PUT") {
        return { status: 200, body: await updateSupplier(session.shop, id, body as Record<string, unknown>, deps.supplyChain) };
      }

      if (method === "DELETE") {
        return { status: 200, body: await softDeleteSupplier(session.shop, id, deps.supplyChain) };
      }
    }

    if (path === "/api/supplier-mappings") {
      const session = await requireInstalledShop(query, deps);

      if (method === "GET") {
        return { status: 200, body: { shop: session.shop, mappings: await listSupplierMappings(session.shop, deps.supplyChain) } };
      }

      if (method === "POST") {
        return { status: 201, body: await upsertSupplierMapping(session.shop, body as Record<string, unknown>, deps.supplyChain) };
      }
    }

    const mappingMatch = path.match(/^\/api\/supplier-mappings\/([^/]+)$/);

    if (mappingMatch) {
      const session = await requireInstalledShop(query, deps);
      const id = decodeURIComponent(mappingMatch[1]);

      if (method === "PUT") {
        return { status: 200, body: await updateSupplierMapping(session.shop, id, body as Record<string, unknown>, deps.supplyChain) };
      }

      if (method === "DELETE") {
        return { status: 200, body: await deleteSupplierMapping(session.shop, id, deps.supplyChain) };
      }
    }

    if (path === "/api/recommendations") {
      const session = await requireInstalledShop(query, deps);

      if (method === "GET") {
        return { status: 200, body: { shop: session.shop, recommendations: await listRecommendations(session.shop, deps.supplyChain) } };
      }
    }

    if (method === "GET" && path === "/api/reorder-queue") {
      const session = await requireInstalledShop(query, deps);

      return {
        status: 200,
        body: {
          shop: session.shop,
          queue: await listReorderQueue(session.shop, deps.supplyChain),
        },
      };
    }

    if (method === "POST" && path === "/api/recommendations/generate") {
      const session = await requireInstalledShop(query, deps);
      const result = await generateRecommendationsForShop(session.shop, deps.supplyChain);

      return {
        status: 200,
        body: {
          generatedCount: result.generatedCount,
          skippedCount: result.skippedCount,
          recommendations: result.recommendations,
        },
      };
    }

    return {
      status: 404,
      body: errorBody("not_found", "API route was not found"),
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        status: error.status,
        body: errorBody(error.code, error.message),
      };
    }

    if (error instanceof ShopifyAdminError) {
      return {
        status: error.status || 502,
        body: errorBody(error.code, error.message),
      };
    }

    if (error instanceof SupplyChainError) {
      return {
        status: error.status,
        body: errorBody(error.code, error.message),
      };
    }

    if (error instanceof OrdersSyncError) {
      return {
        status: error.status,
        body: errorBody(error.code, error.message),
      };
    }

    return {
      status: 500,
      body: errorBody(
        "internal_error",
        error instanceof Error ? error.message : "Request failed",
      ),
    };
  }
}

async function requireInstalledShop(query: URLSearchParams, deps: ApiDeps) {
  const shop = query.get("shop");

  if (!shop) {
    console.warn("[API auth] missing shop query parameter");
    throw new ApiError("missing_shop", "Missing shop query parameter", 400);
  }

  if (deps.authorizationHeader && deps.config) {
    const token = parseBearerToken(deps.authorizationHeader);

    if (!token || !verifyShopifySessionToken(token, shop, deps.config)) {
      console.warn("[API auth] invalid Shopify session token", {
        shop,
        hasBearerToken: Boolean(token),
      });
      throw new ApiError("invalid_session_token", "Invalid Shopify session token", 401);
    }
  } else {
    console.warn("[API auth] request without Shopify session token", {
      shop,
      hasAuthorizationHeader: Boolean(deps.authorizationHeader),
      hasConfig: Boolean(deps.config),
    });
  }

  const session = await deps.sessionStore.load(shop);

  if (!session) {
    console.warn("[API auth] shop session was not found", { shop });
    throw new ApiError("shop_not_installed", "Shop is not installed", 401);
  }

  if (!session.isInstalled) {
    console.warn("[API auth] shop session is uninstalled", { shop });
    throw new ApiError("shop_uninstalled", "Shop is not installed", 403);
  }

  return session;
}

function parseBearerToken(authorizationHeader: string): string | null {
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);

  return match?.[1] || null;
}

class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    status: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

function errorBody(error: string, message: string) {
  return { error, message };
}
