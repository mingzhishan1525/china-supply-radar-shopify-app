import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { decryptSecret, encryptSecret } from "../security/encryption.ts";
import {
  verifyShopifyQueryHmac,
  verifyShopifyWebhookHmac,
} from "../security/shopifyHmac.ts";
import {
  createShopifyAdminClient,
  ShopifyAdminError,
  type ShopifyGraphqlClient,
} from "../shopify/adminClient.ts";
import { handleApiRequest } from "./api.ts";
import {
  APP_MANAGED_BILLING_FIX,
  BillingConfigurationError,
  createProSubscriptionApprovalUrl,
  getBillingStatusForShop,
} from "./billing.ts";
import { getAppConfig, type AppConfig } from "./config.ts";
import { handleOAuthCallback, MemoryOAuthStateStore } from "./oauth.ts";
import { syncOrdersAndSalesVelocityForShop } from "./ordersSync.ts";
import { syncProductsForShop } from "./productSync.ts";
import {
  MemorySessionStore,
  PrismaSessionStore,
  type PrismaSessionClient,
} from "./sessionStore.ts";
import { MemorySupplyChainStore } from "./memorySupplyChainStore.ts";
import {
  generateRecommendationsForShop,
  upsertSupplierMapping,
} from "./supplyChain.ts";
import { MemoryVariantSnapshotStore } from "./variantSnapshotStore.ts";
import {
  handleAppUninstalledWebhook,
  handleCustomersDataRequestWebhook,
  isWebhookAuthenticationError,
} from "./webhooks.ts";

const config: AppConfig = {
  apiKey: "test-key",
  apiSecret: "test-secret",
  appUrl: "https://app.example.com",
  scopes: ["read_products", "read_inventory"],
  encryptionSecret: "local-dev-encryption-secret",
};

describe("app config", () => {
  it("reads Shopify env and validates the session encryption key", () => {
    const appConfig = getAppConfig({
      SHOPIFY_API_KEY: "test-key",
      SHOPIFY_API_SECRET: "test-secret",
      SHOPIFY_APP_URL: "https://app.example.com/",
      SHOPIFY_SCOPES: "read_products,read_inventory",
      SESSION_ENCRYPTION_KEY: "12345678901234567890123456789012",
    });

    assert.equal(appConfig.appUrl, "https://app.example.com");
    assert.deepEqual(appConfig.scopes, ["read_products", "read_inventory"]);
    assert.equal(appConfig.encryptionSecret.length, 32);
  });

  it("throws a clear error for missing or short required env", () => {
    assert.throws(
      () =>
        getAppConfig({
          SHOPIFY_API_SECRET: "test-secret",
          SHOPIFY_APP_URL: "https://app.example.com",
          SESSION_ENCRYPTION_KEY: "12345678901234567890123456789012",
        }),
      /SHOPIFY_API_KEY is required/,
    );

    assert.throws(
      () =>
        getAppConfig({
          SHOPIFY_API_KEY: "test-key",
          SHOPIFY_API_SECRET: "test-secret",
          SHOPIFY_APP_URL: "https://app.example.com",
          SESSION_ENCRYPTION_KEY: "too-short",
        }),
      /SESSION_ENCRYPTION_KEY must be at least 32 characters long/,
    );
  });
});

describe("Shopify HMAC", () => {
  it("verifies OAuth callback query HMAC", () => {
    const query = new URLSearchParams({
      code: "temporary-code",
      shop: "demo-store.myshopify.com",
      state: "state-1",
      timestamp: "1781269000",
    });
    query.set("hmac", signQuery(query, config.apiSecret));

    assert.equal(verifyShopifyQueryHmac(query, config.apiSecret), true);
  });

  it("verifies webhook HMAC", () => {
    const rawBody = JSON.stringify({ id: 123, name: "demo-store" });
    const hmac = createHmac("sha256", config.apiSecret)
      .update(rawBody, "utf8")
      .digest("base64");

    assert.equal(verifyShopifyWebhookHmac(rawBody, hmac, config.apiSecret), true);
  });
});

describe("token encryption", () => {
  it("round trips encrypted access tokens", () => {
    const encrypted = encryptSecret("shpat_test_token", config.encryptionSecret);

    assert.notEqual(encrypted, "shpat_test_token");
    assert.equal(decryptSecret(encrypted, config.encryptionSecret), "shpat_test_token");
  });
});

describe("OAuth callback", () => {
  it("verifies state, exchanges token, and stores encrypted session", async () => {
    const stateStore = new MemoryOAuthStateStore();
    const sessionStore = new MemorySessionStore(config.encryptionSecret);
    await stateStore.put("state-1", "demo-store.myshopify.com");

    const query = new URLSearchParams({
      code: "temporary-code",
      shop: "demo-store.myshopify.com",
      state: "state-1",
      timestamp: "1781269000",
    });
    query.set("hmac", signQuery(query, config.apiSecret));

    const result = await handleOAuthCallback(
      `https://app.example.com/auth/callback?${query.toString()}`,
      config,
      stateStore,
      sessionStore,
      async () => "shpat_test_token",
      async () => undefined,
    );

    const session = await sessionStore.load("demo-store.myshopify.com");
    const stored = await sessionStore.getStoredForTest("demo-store.myshopify.com");

    assert.equal(result.redirectTo, "/?shop=demo-store.myshopify.com");
    assert.ok(session);
    assert.ok(stored);
    assert.equal(session.scope, "read_products,read_inventory");
    assert.equal(session.accessToken, "shpat_test_token");
    assert.notEqual(stored.accessTokenEncrypted, "shpat_test_token");
  });
});

describe("app/uninstalled webhook", () => {
  it("deletes shop session and token after HMAC verification", async () => {
    const sessionStore = new MemorySessionStore(config.encryptionSecret);
    await sessionStore.save({
      shop: "demo-store.myshopify.com",
      accessToken: "shpat_test_token",
      scope: "read_products,read_inventory",
      installedAt: "2026-06-12T00:00:00.000Z",
    });

    const rawBody = JSON.stringify({ shop_domain: "demo-store.myshopify.com" });
    const headers = new Headers({
      "x-shopify-shop-domain": "demo-store.myshopify.com",
      "x-shopify-hmac-sha256": createHmac("sha256", config.apiSecret)
        .update(rawBody, "utf8")
        .digest("base64"),
    });

    await handleAppUninstalledWebhook(rawBody, headers, config, sessionStore, [], async () => undefined);

    const session = await sessionStore.load("demo-store.myshopify.com");
    assert.equal(session, null);
  });

  it("treats missing webhook authentication context as unauthorized", async () => {
    const rawBody = JSON.stringify({ shop_domain: "demo-store.myshopify.com" });

    await assert.rejects(
      handleCustomersDataRequestWebhook(rawBody, new Headers(), config),
      (error) =>
        error instanceof Error &&
        isWebhookAuthenticationError(error) &&
        error.message.includes("missing shop domain"),
    );
  });

  it("treats invalid webhook HMAC as unauthorized", async () => {
    const rawBody = JSON.stringify({ shop_domain: "demo-store.myshopify.com" });
    const headers = new Headers({
      "x-shopify-shop-domain": "demo-store.myshopify.com",
      "x-shopify-hmac-sha256": "invalid",
    });

    await assert.rejects(
      handleCustomersDataRequestWebhook(rawBody, headers, config),
      (error) =>
        error instanceof Error &&
        isWebhookAuthenticationError(error) &&
        error.message.includes("invalid HMAC"),
    );
  });
});

describe("PrismaSessionStore", () => {
  it("saves, loads, and decrypts access tokens", async () => {
    const prisma = new FakePrismaSessionClient();
    const sessionStore = new PrismaSessionStore(prisma, config.encryptionSecret);

    await sessionStore.save({
      shop: "demo-store.myshopify.com",
      accessToken: "shpat_test_token",
      scope: "read_products,read_inventory",
      installedAt: "2026-06-12T00:00:00.000Z",
    });

    const raw = prisma.getRaw("demo-store.myshopify.com");
    const loaded = await sessionStore.load("demo-store.myshopify.com");

    assert.ok(raw);
    assert.notEqual(raw.accessTokenEncrypted, "shpat_test_token");
    assert.equal(
      decryptSecret(raw.accessTokenEncrypted, config.encryptionSecret),
      "shpat_test_token",
    );
    assert.equal(loaded?.accessToken, "shpat_test_token");
    assert.equal(loaded?.scope, "read_products,read_inventory");
  });

  it("marks shops uninstalled and deletes sessions", async () => {
    const prisma = new FakePrismaSessionClient();
    const sessionStore = new PrismaSessionStore(prisma, config.encryptionSecret);

    await sessionStore.save({
      shop: "demo-store.myshopify.com",
      accessToken: "shpat_test_token",
      scope: "read_products",
    });
    await sessionStore.markUninstalled(
      "demo-store.myshopify.com",
      "2026-06-12T00:00:00.000Z",
    );

    const uninstalled = await sessionStore.load("demo-store.myshopify.com");
    assert.equal(uninstalled?.isInstalled, false);
    assert.equal(uninstalled?.uninstalledAt, "2026-06-12T00:00:00.000Z");

    await sessionStore.delete("demo-store.myshopify.com");
    assert.equal(await sessionStore.load("demo-store.myshopify.com"), null);
  });
});

describe("Shopify GraphQL client", () => {
  it("throws shop_not_installed for missing shops", async () => {
    const sessionStore = new MemorySessionStore(config.encryptionSecret);

    await assert.rejects(
      createShopifyAdminClient("demo-store.myshopify.com", sessionStore),
      (error) =>
        error instanceof ShopifyAdminError && error.code === "shop_not_installed",
    );
  });

  it("maps unauthorized and throttled responses to stable errors", async () => {
    const sessionStore = new MemorySessionStore(config.encryptionSecret);
    await sessionStore.save({
      shop: "demo-store.myshopify.com",
      accessToken: "shpat_test_token",
      scope: "read_products",
    });

    const unauthorizedClient = await createShopifyAdminClient(
      "demo-store.myshopify.com",
      sessionStore,
      {
        fetchImpl: async () => new Response("nope", { status: 401 }),
      },
    );
    await assert.rejects(
      unauthorizedClient.graphql("query { shop { name } }"),
      (error) => error instanceof ShopifyAdminError && error.code === "unauthorized",
    );

    const throttledClient = await createShopifyAdminClient(
      "demo-store.myshopify.com",
      sessionStore,
      {
        fetchImpl: async () => new Response("slow down", { status: 429 }),
      },
    );
    await assert.rejects(
      throttledClient.graphql("query { shop { name } }"),
      (error) => error instanceof ShopifyAdminError && error.code === "throttled",
    );
  });
});

describe("Shopify Billing", () => {
  it("detects missing and active Pro subscriptions", async () => {
    const sessionStore = new MemorySessionStore(config.encryptionSecret);
    const inactiveClient: ShopifyGraphqlClient = {
      shop: "demo-store.myshopify.com",
      graphql: async <TData,>() => ({
        currentAppInstallation: {
          activeSubscriptions: [],
        },
      }) as TData,
    };
    const activeClient: ShopifyGraphqlClient = {
      shop: "demo-store.myshopify.com",
      graphql: async <TData,>() => ({
        currentAppInstallation: {
          activeSubscriptions: [
            {
              id: "gid://shopify/AppSubscription/1",
              name: "China Supply Radar Pro",
              status: "ACTIVE",
              currentPeriodEnd: "2026-08-03T00:00:00Z",
              lineItems: [
                {
                  plan: {
                    pricingDetails: {
                      __typename: "AppRecurringPricing",
                      interval: "EVERY_30_DAYS",
                      price: {
                        amount: "29.0",
                        currencyCode: "USD",
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      }) as TData,
    };

    assert.equal((await getBillingStatusForShop("demo-store.myshopify.com", sessionStore, inactiveClient)).subscribed, false);

    const active = await getBillingStatusForShop("demo-store.myshopify.com", sessionStore, activeClient);
    assert.equal(active.subscribed, true);
    assert.equal(active.planName, "China Supply Radar Pro");
    assert.equal(active.status, "ACTIVE");
  });

  it("creates a $29 monthly Shopify Billing approval URL", async () => {
    const sessionStore = new MemorySessionStore(config.encryptionSecret);
    let variables: Record<string, unknown> | undefined;
    const client: ShopifyGraphqlClient = {
      shop: "demo-store.myshopify.com",
      graphql: async <TData,>(_query: string, nextVariables?: Record<string, unknown>) => {
        variables = nextVariables;

        return {
          appSubscriptionCreate: {
            confirmationUrl: "https://demo-store.myshopify.com/admin/charges/approve",
            appSubscription: {
              id: "gid://shopify/AppSubscription/1",
              status: "PENDING",
            },
            userErrors: [],
          },
        } as TData;
      },
    };

    const confirmationUrl = await createProSubscriptionApprovalUrl(
      "demo-store.myshopify.com",
      config,
      sessionStore,
      client,
    );
    const lineItems = variables?.lineItems as Array<{
      plan: {
        appRecurringPricingDetails: {
          price: { amount: number; currencyCode: string };
          interval: string;
        };
      };
    }>;

    assert.equal(confirmationUrl, "https://demo-store.myshopify.com/admin/charges/approve");
    assert.equal(variables?.name, "China Supply Radar Pro");
    assert.equal(variables?.returnUrl, "https://app.example.com/billing/return?shop=demo-store.myshopify.com");
    assert.equal(lineItems[0].plan.appRecurringPricingDetails.price.amount, 29);
    assert.equal(lineItems[0].plan.appRecurringPricingDetails.price.currencyCode, "USD");
    assert.equal(lineItems[0].plan.appRecurringPricingDetails.interval, "EVERY_30_DAYS");
  });

  it("reports a clear blocker when Shopify Managed Pricing is enabled", async () => {
    const sessionStore = new MemorySessionStore(config.encryptionSecret);
    const client: ShopifyGraphqlClient = {
      shop: "demo-store.myshopify.com",
      graphql: async <TData,>() => ({
        appSubscriptionCreate: {
          confirmationUrl: null,
          appSubscription: null,
          userErrors: [
            {
              field: null,
              message: "Managed Pricing Apps cannot use the Billing API (to create charges).",
            },
          ],
        },
      }) as TData,
    };

    await assert.rejects(
      createProSubscriptionApprovalUrl("demo-store.myshopify.com", config, sessionStore, client),
      (error) =>
        error instanceof BillingConfigurationError &&
        error.message.includes(APP_MANAGED_BILLING_FIX),
    );
  });
});

describe("product sync", () => {
  it("writes mocked Shopify products and variants to VariantSnapshot", async () => {
    const sessionStore = new MemorySessionStore(config.encryptionSecret);
    const prisma = new MemoryVariantSnapshotStore();
    await sessionStore.save({
      shop: "demo-store.myshopify.com",
      accessToken: "shpat_test_token",
      scope: "read_products,read_inventory",
    });

    const result = await syncProductsForShop("demo-store.myshopify.com", {
      sessionStore,
      prisma,
      now: new Date("2026-06-12T00:00:00.000Z"),
      graphqlClient: {
        shop: "demo-store.myshopify.com",
        async graphql<TData>() {
          return {
            products: {
              nodes: [
                {
                  id: "gid://shopify/Product/1",
                  title: "Travel Adapter",
                  updatedAt: "2026-06-11T00:00:00.000Z",
                  variants: {
                    nodes: [
                      {
                        id: "gid://shopify/ProductVariant/1",
                        title: "US Plug",
                        sku: "ADAPTER-US",
                        price: "24.00",
                        inventoryQuantity: 128,
                        updatedAt: "2026-06-11T12:00:00.000Z",
                      },
                      {
                        id: "gid://shopify/ProductVariant/2",
                        title: "EU Plug",
                        sku: null,
                        price: null,
                        inventoryQuantity: null,
                        updatedAt: undefined,
                      },
                    ],
                  },
                },
              ],
            },
          } as TData;
        },
      },
    });

    const snapshots = await prisma.variantSnapshot.findMany({
      where: { shop: "demo-store.myshopify.com" },
    });

    assert.deepEqual(result, {
      syncedCount: 2,
      skippedCount: 0,
      errorCount: 0,
      lastSyncedAt: "2026-06-12T00:00:00.000Z",
    });
    assert.equal(snapshots.length, 2);
    const adapter = snapshots.find((snapshot) => snapshot.sku === "ADAPTER-US");
    const noSku = snapshots.find((snapshot) => snapshot.sku === null);
    assert.equal(adapter?.price, "24.00");
    assert.equal(adapter?.inventoryQuantity, 128);
    assert.equal(noSku?.inventoryQuantity, 0);
  });
});

describe("API routes", () => {
  it("standardizes missing shop and not found errors", async () => {
    const deps = {
      sessionStore: new MemorySessionStore(config.encryptionSecret),
      prisma: new MemoryVariantSnapshotStore(),
      supplyChain: new MemorySupplyChainStore(),
    };
    const missingShop = await handleApiRequest(
      "GET",
      "/api/products",
      new URLSearchParams(),
      deps,
    );
    const notFound = await handleApiRequest(
      "GET",
      "/api/nope",
      new URLSearchParams({ shop: "demo-store.myshopify.com" }),
      deps,
    );

    assert.equal(missingShop.status, 400);
    assert.deepEqual(missingShop.body, {
      error: "missing_shop",
      message: "Missing shop query parameter",
    });
    assert.equal(notFound.status, 404);
    assert.deepEqual(notFound.body, {
      error: "not_found",
      message: "API route was not found",
    });
  });

  it("/api/products rejects uninstalled shops", async () => {
    const response = await handleApiRequest(
      "GET",
      "/api/products",
      new URLSearchParams({ shop: "demo-store.myshopify.com" }),
      {
        sessionStore: new MemorySessionStore(config.encryptionSecret),
        prisma: new MemoryVariantSnapshotStore(),
        supplyChain: new MemorySupplyChainStore(),
      },
    );

    assert.equal(response.status, 401);
    assert.deepEqual(response.body, {
      error: "shop_not_installed",
      message: "Shop is not installed",
    });
  });

  it("/api/products returns database snapshots for installed shops", async () => {
    const sessionStore = new MemorySessionStore(config.encryptionSecret);
    const prisma = new MemoryVariantSnapshotStore();
    await sessionStore.save({
      shop: "demo-store.myshopify.com",
      accessToken: "shpat_test_token",
      scope: "read_products,read_inventory",
    });
    await prisma.variantSnapshot.upsert({
      where: {
        shop_shopifyVariantId: {
          shop: "demo-store.myshopify.com",
          shopifyVariantId: "gid://shopify/ProductVariant/1",
        },
      },
      create: {
        shop: "demo-store.myshopify.com",
        shopifyProductId: "gid://shopify/Product/1",
        shopifyVariantId: "gid://shopify/ProductVariant/1",
        sku: "ADAPTER-US",
        title: "US Plug",
        productTitle: "Travel Adapter",
        price: "24.00",
        inventoryQuantity: 128,
        shopifyUpdatedAt: "2026-06-11T12:00:00.000Z",
      },
      update: {
        shopifyProductId: "gid://shopify/Product/1",
        sku: "ADAPTER-US",
        title: "US Plug",
        productTitle: "Travel Adapter",
        price: "24.00",
        inventoryQuantity: 128,
        shopifyUpdatedAt: "2026-06-11T12:00:00.000Z",
        syncedAt: new Date("2026-06-12T00:00:00.000Z"),
      },
    });

    const response = await handleApiRequest(
      "GET",
      "/api/products",
      new URLSearchParams({ shop: "demo-store.myshopify.com" }),
      { sessionStore, prisma, supplyChain: new MemorySupplyChainStore() },
    );

    assert.equal(response.status, 200);
    assert.equal((response.body as { products: unknown[] }).products.length, 1);
  });

  it("/api/sync/products syncs Shopify data and returns synced count", async () => {
    const sessionStore = new MemorySessionStore(config.encryptionSecret);
    const prisma = new MemoryVariantSnapshotStore();
    const originalFetch = globalThis.fetch;
    await sessionStore.save({
      shop: "demo-store.myshopify.com",
      accessToken: "shpat_test_token",
      scope: "read_products,read_inventory",
    });

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: {
            products: {
              nodes: [
                {
                  id: "gid://shopify/Product/1",
                  title: "Travel Adapter",
                  updatedAt: "2026-06-11T00:00:00.000Z",
                  variants: {
                    nodes: [
                      {
                        id: "gid://shopify/ProductVariant/1",
                        title: "US Plug",
                        sku: "ADAPTER-US",
                        price: "24.00",
                        inventoryQuantity: 128,
                        updatedAt: "2026-06-11T12:00:00.000Z",
                      },
                    ],
                  },
                },
              ],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    try {
      const response = await handleApiRequest(
        "POST",
        "/api/sync/products",
        new URLSearchParams({ shop: "demo-store.myshopify.com" }),
        { sessionStore, prisma, supplyChain: new MemorySupplyChainStore() },
      );
      const products = await prisma.variantSnapshot.findMany({
        where: { shop: "demo-store.myshopify.com" },
      });

      assert.equal(response.status, 200);
      assert.equal((response.body as { syncedCount: number }).syncedCount, 1);
      assert.equal((response.body as { skippedCount: number }).skippedCount, 0);
      assert.equal((response.body as { errorCount: number }).errorCount, 0);
      assert.ok((response.body as { lastSyncedAt: string }).lastSyncedAt);
      assert.equal(products.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("/api/sync/products returns standardized Shopify API failure errors", async () => {
    const sessionStore = new MemorySessionStore(config.encryptionSecret);
    const originalFetch = globalThis.fetch;
    await sessionStore.save({
      shop: "demo-store.myshopify.com",
      accessToken: "shpat_test_token",
      scope: "read_products,read_inventory",
    });

    globalThis.fetch = async () => new Response("Shopify unavailable", { status: 500 });

    try {
      const response = await handleApiRequest(
        "POST",
        "/api/sync/products",
        new URLSearchParams({ shop: "demo-store.myshopify.com" }),
        {
          sessionStore,
          prisma: new MemoryVariantSnapshotStore(),
          supplyChain: new MemorySupplyChainStore(),
        },
      );

      assert.equal(response.status, 500);
      assert.deepEqual(response.body, {
        error: "network_error",
        message: "Shopify Admin API request failed with 500",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("supplier API", () => {
  it("creates, lists, updates, and soft deletes suppliers", async () => {
    const { sessionStore, supplyChain } = await installedApiDeps();
    const created = await handleApiRequest(
      "POST",
      "/api/suppliers",
      new URLSearchParams({ shop: "demo-store.myshopify.com" }),
      { sessionStore, prisma: new MemoryVariantSnapshotStore(), supplyChain },
      { name: "Shenzhen Bags", city: "Shenzhen", contactEmail: "ops@example.com" },
    );

    assert.equal(created.status, 201);
    assert.equal((created.body as { leadTimeDays: number }).leadTimeDays, 14);
    assert.equal((created.body as { riskLevel: string }).riskLevel, "unknown");

    const supplierId = (created.body as { id: string }).id;
    const updated = await handleApiRequest(
      "PUT",
      `/api/suppliers/${supplierId}`,
      new URLSearchParams({ shop: "demo-store.myshopify.com" }),
      { sessionStore, prisma: new MemoryVariantSnapshotStore(), supplyChain },
      { leadTimeDays: 28, city: "Ningbo", notes: "Primary factory" },
    );
    assert.equal(updated.status, 200);
    assert.equal((updated.body as { leadTimeDays: number }).leadTimeDays, 28);

    const deleted = await handleApiRequest(
      "DELETE",
      `/api/suppliers/${supplierId}`,
      new URLSearchParams({ shop: "demo-store.myshopify.com" }),
      { sessionStore, prisma: new MemoryVariantSnapshotStore(), supplyChain },
    );
    assert.equal(deleted.status, 200);
    assert.equal((deleted.body as { isActive: boolean }).isActive, false);

    const listed = await handleApiRequest(
      "GET",
      "/api/suppliers",
      new URLSearchParams({ shop: "demo-store.myshopify.com" }),
      { sessionStore, prisma: new MemoryVariantSnapshotStore(), supplyChain },
    );
    assert.equal((listed.body as { suppliers: unknown[] }).suppliers.length, 0);
  });
});

describe("supplier mappings", () => {
  it("creates and updates one primary supplier mapping per variant", async () => {
    const supplyChain = new MemorySupplyChainStore();
    const variant = supplyChain.addVariant(testVariant("variant_1", "Travel Adapter", 12));
    const supplier = await supplyChain.supplier.create({
      data: {
        shop: "demo-store.myshopify.com",
        name: "Ningbo Electronics",
        country: "China",
        province: null,
        city: "Ningbo",
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        wechat: null,
        whatsapp: null,
        leadTimeDays: 21,
        moq: 300,
        notes: null,
        riskLevel: "unknown",
        isActive: true,
      },
    });

    const created = await upsertSupplierMapping(
      "demo-store.myshopify.com",
      {
        variantSnapshotId: variant.id,
        supplierId: supplier.id,
      },
      supplyChain,
    );
    const updated = await upsertSupplierMapping(
      "demo-store.myshopify.com",
      {
        variantSnapshotId: variant.id,
        supplierId: supplier.id,
        factoryLeadTimeDays: 30,
        reorderBufferDays: 10,
      },
      supplyChain,
    );
    const mappings = await supplyChain.supplierMapping.findMany({
      where: { shop: "demo-store.myshopify.com" },
    });

    assert.equal(created.factoryLeadTimeDays, 21);
    assert.equal(updated.id, created.id);
    assert.equal(updated.factoryLeadTimeDays, 30);
    assert.equal(updated.reorderBufferDays, 10);
    assert.equal(mappings.length, 1);
  });

  it("rejects cross-shop mapping attempts", async () => {
    const supplyChain = new MemorySupplyChainStore();
    const variant = supplyChain.addVariant(testVariant("variant_1", "Travel Adapter", 12));
    const supplier = await supplyChain.supplier.create({
      data: {
        shop: "other-store.myshopify.com",
        name: "Other Supplier",
        country: "China",
        province: null,
        city: null,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        wechat: null,
        whatsapp: null,
        leadTimeDays: 14,
        moq: null,
        notes: null,
        riskLevel: "unknown",
        isActive: true,
      },
    });

    await assert.rejects(
      upsertSupplierMapping(
        "demo-store.myshopify.com",
        {
          variantSnapshotId: variant.id,
          supplierId: supplier.id,
        },
        supplyChain,
      ),
      /Supplier was not found/,
    );
  });
});

describe("recommendations", () => {
  it("skips Gift Card variants and emits supplier, sales velocity, and stockout reasons", async () => {
    const supplyChain = new MemorySupplyChainStore();
    supplyChain.addVariant(testVariant("gift_1", "Gift Card", 0));
    const noMapping = supplyChain.addVariant(testVariant("variant_1", "Travel Adapter", 12));
    const noVelocity = supplyChain.addVariant(testVariant("variant_2", "Storage Bag", 30));
    const outOfStock = supplyChain.addVariant(testVariant("variant_3", "Snowboard", 0));
    const supplier = await supplyChain.supplier.create({
      data: {
        shop: "demo-store.myshopify.com",
        name: "Shenzhen Homeware",
        country: "China",
        province: null,
        city: null,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        wechat: null,
        whatsapp: null,
        leadTimeDays: 20,
        moq: null,
        notes: null,
        riskLevel: "unknown",
        isActive: true,
      },
    });
    await upsertSupplierMapping(
      "demo-store.myshopify.com",
      {
        variantSnapshotId: noVelocity.id,
        supplierId: supplier.id,
      },
      supplyChain,
    );
    await upsertSupplierMapping(
      "demo-store.myshopify.com",
      {
        variantSnapshotId: outOfStock.id,
        supplierId: supplier.id,
      },
      supplyChain,
    );

    const result = await generateRecommendationsForShop(
      "demo-store.myshopify.com",
      supplyChain,
      new Date("2026-06-13T00:00:00.000Z"),
    );

    assert.equal(result.skippedCount, 1);
    assert.equal(result.generatedCount, 3);
    assert.equal(
      result.recommendations.find((item) => item.variantSnapshotId === noMapping.id)?.reason,
      "needs_supplier_mapping",
    );
    assert.equal(
      result.recommendations.find((item) => item.variantSnapshotId === noVelocity.id)?.reason,
      "needs_sales_velocity",
    );
    assert.equal(
      result.recommendations.find((item) => item.variantSnapshotId === outOfStock.id)?.reason,
      "out_of_stock",
    );
  });

  it("rejects recommendations API for uninstalled shops", async () => {
    const response = await handleApiRequest(
      "POST",
      "/api/recommendations/generate",
      new URLSearchParams({ shop: "demo-store.myshopify.com" }),
      {
        sessionStore: new MemorySessionStore(config.encryptionSecret),
        prisma: new MemoryVariantSnapshotStore(),
        supplyChain: new MemorySupplyChainStore(),
      },
    );

    assert.equal(response.status, 401);
  });

  it("/api/reorder-queue returns calculated reorder items", async () => {
    const { sessionStore, supplyChain } = await installedApiDeps();
    const variant = supplyChain.addVariant({
      ...testVariant("variant_1", "Travel Adapter", 12),
      sku: "ADAPTER-US",
    });
    const supplier = await supplyChain.supplier.create({
      data: {
        shop: "demo-store.myshopify.com",
        name: "Ningbo Electronics",
        country: "China",
        province: null,
        city: null,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        wechat: null,
        whatsapp: null,
        leadTimeDays: 10,
        moq: null,
        notes: null,
        riskLevel: "unknown",
        isActive: true,
      },
    });
    await upsertSupplierMapping(
      "demo-store.myshopify.com",
      {
        variantSnapshotId: variant.id,
        supplierId: supplier.id,
        factoryLeadTimeDays: 10,
        reorderBufferDays: 5,
      },
      supplyChain,
    );
    supplyChain.addSalesVelocity({
      shop: "demo-store.myshopify.com",
      shopifyVariantId: variant.shopifyVariantId,
      variantSnapshotId: variant.id || "",
      unitsSold: 30,
      windowDays: 30,
      estimatedDailySales: 1,
      calculatedFrom: "2026-05-15T00:00:00.000Z",
      calculatedTo: "2026-06-14T00:00:00.000Z",
    });

    await generateRecommendationsForShop(
      "demo-store.myshopify.com",
      supplyChain,
      new Date("2026-06-14T00:00:00.000Z"),
    );
    const response = await handleApiRequest(
      "GET",
      "/api/reorder-queue",
      new URLSearchParams({ shop: "demo-store.myshopify.com" }),
      { sessionStore, prisma: new MemoryVariantSnapshotStore(), supplyChain },
    );

    assert.equal(response.status, 200);
    assert.deepEqual((response.body as { queue: unknown[] }).queue, [
      {
        sku: "ADAPTER-US",
        productTitle: "Travel Adapter",
        variantTitle: "Default Title",
        inventory: 12,
        estimatedDailySales: 1,
        inventoryCoverDays: 12,
        recommendedReorderDate: "2026-06-11T00:00:00.000Z",
        riskLevel: "critical",
      },
    ]);
  });
});

describe("orders sync and sales velocity", () => {
  it("aggregates line items, skips cancelled orders, gift cards, and missing variants", async () => {
    const sessionStore = new MemorySessionStore(config.encryptionSecret);
    const supplyChain = new MemorySupplyChainStore();
    const adapter = supplyChain.addVariant(testVariant("variant_1", "Travel Adapter", 12));
    supplyChain.addVariant(testVariant("gift_1", "Gift Card", 0));
    await sessionStore.save({
      shop: "demo-store.myshopify.com",
      accessToken: "shpat_test_token",
      scope: "read_products,read_inventory,read_orders",
    });

    const result = await syncOrdersAndSalesVelocityForShop("demo-store.myshopify.com", {
      sessionStore,
      prisma: supplyChain,
      windowDays: 30,
      now: new Date("2026-06-14T00:00:00.000Z"),
      graphqlClient: {
        shop: "demo-store.myshopify.com",
        async graphql<TData>() {
          return {
            orders: {
              nodes: [
                {
                  id: "order_1",
                  createdAt: "2026-06-13T00:00:00.000Z",
                  cancelledAt: null,
                  lineItems: {
                    nodes: [
                      {
                        quantity: 3,
                        variant: { id: adapter.shopifyVariantId },
                        title: "Travel Adapter",
                        name: "Travel Adapter",
                      },
                      {
                        quantity: 2,
                        variant: null,
                        title: "Custom item",
                        name: "Custom item",
                      },
                      {
                        quantity: 1,
                        variant: { id: "gid://shopify/ProductVariant/gift_1" },
                        title: "Gift Card",
                        name: "Gift Card",
                      },
                    ],
                  },
                },
                {
                  id: "order_2",
                  createdAt: "2026-06-13T00:00:00.000Z",
                  cancelledAt: "2026-06-13T01:00:00.000Z",
                  lineItems: {
                    nodes: [
                      {
                        quantity: 10,
                        variant: { id: adapter.shopifyVariantId },
                        title: "Travel Adapter",
                        name: "Travel Adapter",
                      },
                    ],
                  },
                },
                {
                  id: "order_3",
                  createdAt: "2026-06-12T00:00:00.000Z",
                  cancelledAt: null,
                  lineItems: {
                    nodes: [
                      {
                        quantity: 5,
                        variant: { id: adapter.shopifyVariantId },
                        title: "Travel Adapter",
                        name: "Travel Adapter",
                      },
                    ],
                  },
                },
              ],
            },
          } as TData;
        },
      },
    });
    const velocities = await supplyChain.salesVelocity.findMany({
      where: { shop: "demo-store.myshopify.com" },
    });

    assert.deepEqual(result, {
      ordersScanned: 2,
      lineItemsScanned: 4,
      variantsUpdated: 1,
      matchedVariants: 1,
      unmatchedLineItems: 2,
      skippedCount: 3,
      lastOrderCreatedAt: "2026-06-13T00:00:00.000Z",
      syncStartedAt: "2026-06-14T00:00:00.000Z",
      syncFinishedAt: "2026-06-14T00:00:00.000Z",
      windowDays: 30,
      calculatedFrom: "2026-05-15T00:00:00.000Z",
      calculatedTo: "2026-06-14T00:00:00.000Z",
    });
    assert.equal(velocities.length, 1);
    assert.equal(velocities[0].unitsSold, 8);
    assert.equal(velocities[0].estimatedDailySales, 8 / 30);
  });

  it("paginates across multiple order pages", async () => {
    const sessionStore = new MemorySessionStore(config.encryptionSecret);
    const supplyChain = new MemorySupplyChainStore();
    const adapter = supplyChain.addVariant(testVariant("variant_1", "Travel Adapter", 12));
    let callCount = 0;

    await sessionStore.save({
      shop: "demo-store.myshopify.com",
      accessToken: "shpat_test_token",
      scope: "read_products,read_inventory,read_orders",
    });

    await syncOrdersAndSalesVelocityForShop("demo-store.myshopify.com", {
      sessionStore,
      prisma: supplyChain,
      windowDays: 30,
      now: new Date("2026-06-14T00:00:00.000Z"),
      graphqlClient: {
        shop: "demo-store.myshopify.com",
        async graphql<TData>(_query: string, variables?: Record<string, unknown>) {
          callCount += 1;

          if (!variables?.after) {
            return {
              orders: {
                nodes: [
                  {
                    id: "order_1",
                    createdAt: "2026-06-13T00:00:00.000Z",
                    cancelledAt: null,
                    lineItems: {
                      nodes: [
                        {
                          quantity: 2,
                          variant: { id: adapter.shopifyVariantId },
                          title: "Travel Adapter",
                          name: "Travel Adapter",
                        },
                      ],
                    },
                  },
                ],
                pageInfo: {
                  hasNextPage: true,
                  endCursor: "cursor_1",
                },
              },
            } as TData;
          }

          return {
            orders: {
              nodes: [
                {
                  id: "order_2",
                  createdAt: "2026-06-12T00:00:00.000Z",
                  cancelledAt: null,
                  lineItems: {
                    nodes: [
                      {
                        quantity: 4,
                        variant: { id: adapter.shopifyVariantId },
                        title: "Travel Adapter",
                        name: "Travel Adapter",
                      },
                    ],
                  },
                },
              ],
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
            },
          } as TData;
        },
      },
    });

    const velocities = await supplyChain.salesVelocity.findMany({
      where: { shop: "demo-store.myshopify.com" },
    });

    assert.equal(callCount, 2);
    assert.equal(velocities.length, 1);
    assert.equal(velocities[0].unitsSold, 6);
  });

  it("rejects invalid windowDays and missing read_orders scope", async () => {
    const sessionStore = new MemorySessionStore(config.encryptionSecret);
    await sessionStore.save({
      shop: "demo-store.myshopify.com",
      accessToken: "shpat_test_token",
      scope: "read_products,read_inventory",
    });

    const invalidWindow = await handleApiRequest(
      "POST",
      "/api/sync/orders",
      new URLSearchParams({ shop: "demo-store.myshopify.com", windowDays: "45" }),
      {
        sessionStore,
        prisma: new MemoryVariantSnapshotStore(),
        supplyChain: new MemorySupplyChainStore(),
      },
    );
    assert.equal(invalidWindow.status, 400);
    assert.equal((invalidWindow.body as { error: string }).error, "invalid_window_days");
    assert.equal(
      (invalidWindow.body as { message: string }).message,
      "windowDays must be one of 7, 14, 30, 60, or 90",
    );

    const missingScope = await handleApiRequest(
      "POST",
      "/api/sync/orders",
      new URLSearchParams({ shop: "demo-store.myshopify.com", windowDays: "30" }),
      {
        sessionStore,
        prisma: new MemoryVariantSnapshotStore(),
        supplyChain: new MemorySupplyChainStore(),
      },
    );
    assert.equal(missingScope.status, 403);
    assert.equal((missingScope.body as { error: string }).error, "missing_read_orders_scope");
  });

  it("recommendations use real sales velocity when available", async () => {
    const supplyChain = new MemorySupplyChainStore();
    const variant = supplyChain.addVariant(testVariant("variant_1", "Travel Adapter", 12));
    const supplier = await supplyChain.supplier.create({
      data: {
        shop: "demo-store.myshopify.com",
        name: "Ningbo Electronics",
        country: "China",
        province: null,
        city: null,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        wechat: null,
        whatsapp: null,
        leadTimeDays: 10,
        moq: null,
        notes: null,
        riskLevel: "unknown",
        isActive: true,
      },
    });
    await upsertSupplierMapping(
      "demo-store.myshopify.com",
      {
        variantSnapshotId: variant.id,
        supplierId: supplier.id,
        factoryLeadTimeDays: 10,
        reorderBufferDays: 5,
      },
      supplyChain,
    );
    supplyChain.addSalesVelocity({
      shop: "demo-store.myshopify.com",
      shopifyVariantId: variant.shopifyVariantId,
      variantSnapshotId: variant.id || "",
      unitsSold: 30,
      windowDays: 30,
      estimatedDailySales: 1,
      calculatedFrom: "2026-05-15T00:00:00.000Z",
      calculatedTo: "2026-06-14T00:00:00.000Z",
    });

    const result = await generateRecommendationsForShop(
      "demo-store.myshopify.com",
      supplyChain,
      new Date("2026-06-14T00:00:00.000Z"),
    );
    const recommendation = result.recommendations[0];

    assert.equal(recommendation.reason, "calculated_from_sales_velocity");
    assert.equal(recommendation.estimatedDailySales, 1);
    assert.equal(recommendation.inventoryCoverDays, 12);
    assert.equal(recommendation.stockoutDate, "2026-06-26T00:00:00.000Z");
    assert.equal(recommendation.latestReorderDate, "2026-06-11T00:00:00.000Z");
  });
});

async function installedApiDeps() {
  const sessionStore = new MemorySessionStore(config.encryptionSecret);
  const supplyChain = new MemorySupplyChainStore();
  await sessionStore.save({
    shop: "demo-store.myshopify.com",
    accessToken: "shpat_test_token",
    scope: "read_products,read_inventory",
  });

  return { sessionStore, supplyChain };
}

function testVariant(id: string, productTitle: string, inventoryQuantity: number) {
  return {
    id,
    shop: "demo-store.myshopify.com",
    shopifyProductId: `gid://shopify/Product/${id}`,
    shopifyVariantId: `gid://shopify/ProductVariant/${id}`,
    sku: null,
    title: "Default Title",
    productTitle,
    price: "10.00",
    inventoryQuantity,
    shopifyUpdatedAt: "2026-06-13T00:00:00.000Z",
    syncedAt: "2026-06-13T00:00:00.000Z",
  };
}

function signQuery(query: URLSearchParams, apiSecret: string): string {
  const message = Array.from(query.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHmac("sha256", apiSecret).update(message).digest("hex");
}

class FakePrismaSessionClient implements PrismaSessionClient {
  private readonly rows = new Map<string, Awaited<ReturnType<PrismaSessionClient["shopSession"]["upsert"]>>>();

  readonly shopSession = {
    upsert: async (args: Parameters<PrismaSessionClient["shopSession"]["upsert"]>[0]) => {
      const previous = this.rows.get(args.where.shop);
      const now = new Date();
      const row = previous
        ? {
            ...previous,
            ...args.update,
            updatedAt: now,
          }
        : {
            id: `session_${this.rows.size + 1}`,
            ...args.create,
            uninstalledAt: null,
            updatedAt: now,
          };

      this.rows.set(args.where.shop, row);
      return row;
    },
    findUnique: async (args: Parameters<PrismaSessionClient["shopSession"]["findUnique"]>[0]) => {
      return this.rows.get(args.where.shop) || null;
    },
    delete: async (args: Parameters<PrismaSessionClient["shopSession"]["delete"]>[0]) => {
      const row = this.rows.get(args.where.shop);

      if (!row) {
        throw new Error("Record not found");
      }

      this.rows.delete(args.where.shop);
      return row;
    },
    deleteMany: async (args: Parameters<PrismaSessionClient["shopSession"]["deleteMany"]>[0]) => {
      const existed = this.rows.delete(args.where.shop);
      return { count: existed ? 1 : 0 };
    },
    update: async (args: Parameters<PrismaSessionClient["shopSession"]["update"]>[0]) => {
      const row = this.rows.get(args.where.shop);

      if (!row) {
        throw new Error("Record not found");
      }

      const next = {
        ...row,
        ...args.data,
        updatedAt: new Date(),
      };
      this.rows.set(args.where.shop, next);
      return next;
    },
  };

  getRaw(shop: string) {
    return this.rows.get(shop) || null;
  }
}
