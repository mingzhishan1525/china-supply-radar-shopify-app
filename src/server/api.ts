import { ShopifyAdminError } from "../shopify/adminClient.ts";
import { verifyShopifySessionToken } from "../security/shopifySessionToken.ts";
import { exchangeShopifySessionTokenForOfflineAccessToken } from "./oauth.ts";
import {
  BillingConfigurationError,
  cancelProSubscription,
  createProSubscriptionApprovalUrl,
  getBillingStatusForShop,
} from "./billing.ts";
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
import { entitlementsFromBilling, FREE_SKU_LIMIT } from "./entitlements.ts";
import type { BillingStatus } from "./billing.ts";
import { trackGrowthEvent } from "./growthTracking.ts";
import { trackRevenueEvent } from "./revenueTracking.ts";
import {
  createExtensionLinkCode,
  ExtensionLinkCodeError,
  verifyExtensionLinkCode,
} from "./extensionBridge.ts";
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
  billingStatusResolver?: (shop: string) => Promise<BillingStatus>;
};

export async function handleApiRequest(
  method: string,
  path: string,
  query: URLSearchParams,
  deps: ApiDeps,
  body: unknown = {},
): Promise<ApiResponse> {
  try {
    if (method === "GET" && path === "/api/extension/entitlement") {
      if (!deps.config) {
        throw new ApiError("missing_config", "Extension bridge requires app configuration", 500);
      }
      const code = query.get("code");

      if (!code) {
        throw new ApiError("missing_link_code", "Missing extension connection code", 400);
      }

      const payload = verifyExtensionLinkCode(code, deps.config.encryptionSecret);
      const billing = await resolveBillingStatus(payload.shop, deps);

      return {
        status: 200,
        body: {
          plan: billing.subscribed ? "PRO" : "FREE",
          subscribed: billing.subscribed,
          checkedAt: new Date().toISOString(),
          codeExpiresAt: new Date(payload.exp * 1000).toISOString(),
        },
      };
    }

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

    if (method === "GET" && path === "/api/billing/status") {
      const session = await requireInstalledShop(query, deps);
      const billing = await resolveBillingStatus(session.shop, deps);

      return {
        status: 200,
        body: {
          shop: session.shop,
          billing,
          entitlements: entitlementsFromBilling(billing),
        },
      };
    }

    if (method === "POST" && path === "/api/paywall/view") {
      const session = await requireInstalledShop(query, deps);

      if (deps.config) {
        await trackGrowthEvent(deps.config, {
          eventType: "PAYWALL_VIEW",
          source: "shopify",
          shop: session.shop,
          metadata: {
            feature: typeof (body as Record<string, unknown>).feature === "string"
              ? (body as Record<string, unknown>).feature
              : "unknown",
            plan: "FREE",
          },
        });
      }

      return { status: 202, body: { accepted: true } };
    }

    if (method === "POST" && path === "/api/extension/link-code") {
      const session = await requireInstalledShop(query, deps);

      if (!deps.config) {
        throw new ApiError("missing_config", "Extension bridge requires app configuration", 500);
      }

      return {
        status: 200,
        body: {
          code: createExtensionLinkCode(session.shop, deps.config.encryptionSecret),
          expiresInSeconds: 60 * 60 * 24 * 30,
        },
      };
    }

    if (
      method === "POST" &&
      (path === "/api/billing/create" || path === "/api/billing/subscribe")
    ) {
      const session = await requireInstalledShop(query, deps);

      if (!deps.config) {
        throw new ApiError("missing_config", "Billing requires app configuration", 500);
      }
      await trackGrowthEvent(deps.config, {
        eventType: "UPGRADE_CLICK",
        source: "shopify",
        shop: session.shop,
        metadata: { plan: "FREE", destination: "shopify_billing" },
      });
      await trackGrowthEvent(deps.config, {
        eventType: "CHECKOUT_START",
        source: "shopify",
        shop: session.shop,
        metadata: { plan: "PRO", price: 29, feature: "billing_create" },
      });

      return {
        status: 200,
        body: {
          shop: session.shop,
          confirmationUrl: await createProSubscriptionApprovalUrl(
            session.shop,
            deps.config,
            deps.sessionStore,
          ),
        },
      };
    }

    if (method === "POST" && path === "/api/billing/cancel") {
      const session = await requireInstalledShop(query, deps);
      return {
        status: 200,
        body: {
          shop: session.shop,
          billing: await cancelProSubscription(session.shop, deps.sessionStore),
        },
      };
    }

    if (method === "GET" && path === "/api/products") {
      const session = await requireInstalledShop(query, deps);
      const products = await listVariantSnapshotsForShop(session.shop, deps.prisma);
      const billing = await resolveBillingStatus(session.shop, deps);
      const entitlements = entitlementsFromBilling(billing);

      return {
        status: 200,
        body: {
          shop: session.shop,
          products: entitlements.plan === "PRO" ? products : products.slice(0, FREE_SKU_LIMIT),
          entitlements,
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
      const entitlements = await getEntitlements(session.shop, deps);

      return {
        status: 200,
        body: {
          shop: session.shop,
          salesVelocity: entitlements.plan === "PRO"
            ? await listSalesVelocityForShop(session.shop, deps.supplyChain)
            : (await listSalesVelocityForShop(session.shop, deps.supplyChain)).slice(0, FREE_SKU_LIMIT),
          locked: false,
        },
      };
    }

    if (path === "/api/suppliers") {
      const session = await requireInstalledShop(query, deps);

      if (method === "GET") {
        return { status: 200, body: { shop: session.shop, suppliers: await listSuppliers(session.shop, deps.supplyChain) } };
      }

      if (method === "POST") {
        await requireFreeResourceLimit(
          session.shop,
          deps,
          "supplier",
          (await listSuppliers(session.shop, deps.supplyChain)).length,
        );
        return { status: 201, body: await createSupplier(session.shop, body as Record<string, unknown>, deps.supplyChain) };
      }
    }

    const supplierMatch = path.match(/^\/api\/suppliers\/([^/]+)$/);

    if (supplierMatch) {
      const session = await requireInstalledShop(query, deps);
      const id = decodeURIComponent(supplierMatch[1]);

      if (method === "PUT") {
        await requirePro(session.shop, deps, "Supplier intelligence");
        return { status: 200, body: await updateSupplier(session.shop, id, body as Record<string, unknown>, deps.supplyChain) };
      }

      if (method === "DELETE") {
        await requirePro(session.shop, deps, "Supplier intelligence");
        return { status: 200, body: await softDeleteSupplier(session.shop, id, deps.supplyChain) };
      }
    }

    if (path === "/api/supplier-mappings") {
      const session = await requireInstalledShop(query, deps);

      if (method === "GET") {
        return { status: 200, body: { shop: session.shop, mappings: await listSupplierMappings(session.shop, deps.supplyChain) } };
      }

      if (method === "POST") {
        await requireFreeResourceLimit(
          session.shop,
          deps,
          "supplier mapping",
          (await listSupplierMappings(session.shop, deps.supplyChain)).length,
        );
        return { status: 201, body: await upsertSupplierMapping(session.shop, body as Record<string, unknown>, deps.supplyChain) };
      }
    }

    const mappingMatch = path.match(/^\/api\/supplier-mappings\/([^/]+)$/);

    if (mappingMatch) {
      const session = await requireInstalledShop(query, deps);
      const id = decodeURIComponent(mappingMatch[1]);

      if (method === "PUT") {
        await requirePro(session.shop, deps, "Supplier mapping");
        return { status: 200, body: await updateSupplierMapping(session.shop, id, body as Record<string, unknown>, deps.supplyChain) };
      }

      if (method === "DELETE") {
        await requirePro(session.shop, deps, "Supplier mapping");
        return { status: 200, body: await deleteSupplierMapping(session.shop, id, deps.supplyChain) };
      }
    }

    if (path === "/api/recommendations") {
      const session = await requireInstalledShop(query, deps);

      if (method === "GET") {
        const entitlements = await getEntitlements(session.shop, deps);
        return {
          status: 200,
          body: {
            shop: session.shop,
            recommendations: entitlements.plan === "PRO"
              ? await listRecommendations(session.shop, deps.supplyChain)
              : (await listRecommendations(session.shop, deps.supplyChain)).slice(0, FREE_SKU_LIMIT),
            locked: false,
          },
        };
      }
    }

    if (method === "GET" && path === "/api/reorder-queue") {
      const session = await requireInstalledShop(query, deps);
      const entitlements = await getEntitlements(session.shop, deps);

      return {
        status: 200,
        body: {
          shop: session.shop,
          queue: entitlements.plan === "PRO"
            ? await listReorderQueue(session.shop, deps.supplyChain)
            : (await listReorderQueue(session.shop, deps.supplyChain)).slice(0, FREE_SKU_LIMIT),
          locked: false,
        },
      };
    }

    if (method === "POST" && path === "/api/recommendations/generate") {
      const session = await requireInstalledShop(query, deps);
      const entitlements = await getEntitlements(session.shop, deps);
      const result = await generateRecommendationsForShop(session.shop, deps.supplyChain);
      const visibleRecommendations = entitlements.plan === "PRO"
        ? result.recommendations
        : result.recommendations.slice(0, FREE_SKU_LIMIT);
      const firstValueRecommendation = visibleRecommendations.find(isFirstValueRecommendation);

      if (firstValueRecommendation && deps.config) {
        const externalEventId = `first_value:shopify:${session.shop}:v1`;
        const activationMetadata = {
          definition: "real_sku_recommendation_with_supplier_and_sales_velocity",
          variant_snapshot_id: firstValueRecommendation.variantSnapshotId,
          risk_level: firstValueRecommendation.riskLevel,
          plan: entitlements.plan,
        };

        await Promise.all([
          trackGrowthEvent(deps.config, {
            eventType: "ACTIVATE",
            source: "shopify",
            shop: session.shop,
            metadata: {
              event_id: externalEventId,
              ...activationMetadata,
            },
          }),
          trackRevenueEvent(deps.config, {
            eventType: "ACTIVATE",
            shop: session.shop,
            externalId: externalEventId,
            metadata: activationMetadata,
          }),
        ]);
      }

      return {
        status: 200,
        body: {
          generatedCount: result.generatedCount,
          skippedCount: result.skippedCount,
          recommendations: visibleRecommendations,
          activated: Boolean(firstValueRecommendation),
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

    if (error instanceof BillingConfigurationError) {
      return {
        status: error.status,
        body: errorBody(error.code, error.message),
      };
    }

    if (error instanceof ExtensionLinkCodeError) {
      return {
        status: error.status,
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

async function resolveBillingStatus(shop: string, deps: ApiDeps) {
  if (deps.billingStatusResolver) {
    return deps.billingStatusResolver(shop);
  }

  if (deps.config) {
    throw new ApiError(
      "missing_billing_resolver",
      "Billing entitlement verification is unavailable",
      500,
    );
  }

  // Unit-level API callers can omit billing; the production server always injects
  // the Shopify-backed resolver below.
  return {
    active: true,
    plan: "PRO" as const,
    subscribed: true,
    planName: "China Supply Radar Pro",
    status: "ACTIVE",
    subscriptionId: "test-entitlement",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  };
}

async function getEntitlements(shop: string, deps: ApiDeps) {
  return entitlementsFromBilling(await resolveBillingStatus(shop, deps));
}

async function requirePro(shop: string, deps: ApiDeps, feature: string) {
  const entitlements = await getEntitlements(shop, deps);

  if (entitlements.plan !== "PRO") {
    throw new ApiError(
      "pro_required",
      `${feature} requires China Supply Radar Pro`,
      402,
    );
  }
}

async function requireFreeResourceLimit(
  shop: string,
  deps: ApiDeps,
  resource: string,
  currentCount: number,
) {
  const entitlements = await getEntitlements(shop, deps);

  if (entitlements.plan === "FREE" && currentCount >= FREE_SKU_LIMIT) {
    throw new ApiError(
      "pro_required",
      `Free includes one ${resource}; upgrade to add more`,
      402,
    );
  }
}

function isFirstValueRecommendation(recommendation: {
  supplierId?: string | null;
  estimatedDailySales?: number | null;
  riskLevel: string;
}) {
  return Boolean(
    recommendation.supplierId
    && recommendation.estimatedDailySales !== null
    && recommendation.estimatedDailySales !== undefined
    && !recommendation.riskLevel.startsWith("pending"),
  );
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

    const offlineTokenSet = await exchangeShopifySessionTokenForOfflineAccessToken(
      shop,
      token,
      deps.config,
    );
    await deps.sessionStore.save({
      shop,
      ...offlineTokenSet,
      scope: deps.config.scopes.join(","),
    });
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
