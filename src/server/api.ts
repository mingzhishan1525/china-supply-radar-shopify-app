import { ShopifyAdminError } from "../shopify/adminClient.ts";
import { authenticateShopRequest } from "./requestAuth.ts";
import { ShopifyTokenError } from "./tokenErrors.ts";
import {
  BillingConfigurationError,
  cancelProSubscription,
  createProSubscriptionApprovalUrl,
  getBillingStatusForShop,
} from "./billing.ts";
import type { AppConfig } from "./config.ts";
import {
  ProductSyncError,
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
  billingStatusResolver?: (shop: string, store: SessionStore) => Promise<BillingStatus>;
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
      // Attribute only Shopify-verified subscriptions from an authenticated call.
      // Stable external IDs let Revenue OS deduplicate repeated status reads.
      if (billing.subscribed && billing.subscriptionId && deps.config) {
        void trackRevenueEvent(deps.config, {
          eventType: "SUBSCRIPTION", shop: session.shop,
          amount: billing.test ? 0 : deps.config.revenueOsPlanAmount,
          externalId: `subscription:shopify:${billing.subscriptionId}`,
          metadata: { trigger: "authenticated_billing_status", subscription_id: billing.subscriptionId, test: billing.test === true },
        });
      }

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

    if (error instanceof ShopifyTokenError) {
      return { status: error.status, body: errorBody(error.code, error.message) };
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

    if (error instanceof ProductSyncError || error instanceof OrdersSyncError) {
      return {
        status: error.status,
        body: errorBody(error.code, error.message),
      };
    }

    console.error("[API internal error]", error);
    return {
      status: 500,
      body: errorBody("internal_error", "We couldn't complete this request. Please try again."),
    };
  }
}

async function resolveBillingStatus(shop: string, deps: ApiDeps) {
  if (deps.billingStatusResolver) {
    return deps.billingStatusResolver(shop, deps.sessionStore);
  }

  throw new ApiError("missing_billing_resolver", "Billing entitlement verification is unavailable", 503);
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

  if (!deps.config) throw new ApiError("missing_config", "App authentication is unavailable", 503);
  const authenticated = await authenticateShopRequest(shop, deps.authorizationHeader, deps.config, deps.sessionStore);
  deps.sessionStore = authenticated.store;
  const session = authenticated.session;

  return session;
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
