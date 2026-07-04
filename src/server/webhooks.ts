import { verifyShopifyWebhookHmac } from "../security/shopifyHmac.ts";
import type { AppConfig } from "./config.ts";
import type { SessionStore } from "./sessionStore.ts";

export type ShopDataCleanupStore = {
  shopSession?: DeleteManyModel;
  variantSnapshot?: DeleteManyModel;
  supplier?: DeleteManyModel;
  supplierMapping?: DeleteManyModel;
  salesVelocity?: DeleteManyModel;
  recommendation?: DeleteManyModel;
};

type DeleteManyModel = {
  deleteMany(args: { where: { shop: string } }): Promise<{ count: number }>;
};

export async function handleAppUninstalledWebhook(
  rawBody: string,
  headers: Headers,
  config: AppConfig,
  sessionStore: SessionStore,
  cleanupStores: ShopDataCleanupStore[] = [],
): Promise<void> {
  const shopDomain = headers.get("x-shopify-shop-domain");
  const hmac = headers.get("x-shopify-hmac-sha256");

  if (!shopDomain) {
    throw new Error("Webhook is missing shop domain");
  }

  if (!verifyShopifyWebhookHmac(rawBody, hmac, config.apiSecret)) {
    throw new Error("Webhook HMAC verification failed");
  }

  console.log(`[SECURITY] App uninstalled for shop: ${shopDomain}`);
  await deleteShopDataForShop(shopDomain, sessionStore, cleanupStores);
}

/**
 * GDPR Webhook: CUSTOMERS_DATA_REQUEST
 * Customers request access to their personal data
 * Our app does not store any customer personal data, so this is a no-op
 */
export async function handleCustomersDataRequestWebhook(
  rawBody: string,
  headers: Headers,
  config: AppConfig,
): Promise<void> {
  const shopDomain = headers.get("x-shopify-shop-domain");
  const hmac = headers.get("x-shopify-hmac-sha256");

  if (!shopDomain) {
    throw new Error("Webhook is missing shop domain");
  }

  if (!verifyShopifyWebhookHmac(rawBody, hmac, config.apiSecret)) {
    throw new Error("Webhook HMAC verification failed");
  }

  console.log(`[SECURITY] Received CUSTOMERS_DATA_REQUEST for shop: ${shopDomain}`);
  console.log(`[INFO] No customer personal data stored, no action required`);
}

/**
 * GDPR Webhook: CUSTOMERS_REDACT
 * Customers request deletion of their personal data
 * Our app does not store any customer personal data, so this is a no-op
 */
export async function handleCustomersRedactWebhook(
  rawBody: string,
  headers: Headers,
  config: AppConfig,
): Promise<void> {
  const shopDomain = headers.get("x-shopify-shop-domain");
  const hmac = headers.get("x-shopify-hmac-sha256");

  if (!shopDomain) {
    throw new Error("Webhook is missing shop domain");
  }

  if (!verifyShopifyWebhookHmac(rawBody, hmac, config.apiSecret)) {
    throw new Error("Webhook HMAC verification failed");
  }

  console.log(`[SECURITY] Received CUSTOMERS_REDACT for shop: ${shopDomain}`);
  console.log(`[INFO] No customer personal data stored, no action required`);
}

/**
 * GDPR Webhook: SHOP_REDACT
 * Shop owner requests deletion of all their store data
 * We delete all session and shop-specific data for this shop
 * Order statistics are anonymized and retained
 */
export async function handleShopRedactWebhook(
  rawBody: string,
  headers: Headers,
  config: AppConfig,
  sessionStore: SessionStore,
  cleanupStores: ShopDataCleanupStore[] = [],
): Promise<void> {
  const shopDomain = headers.get("x-shopify-shop-domain");
  const hmac = headers.get("x-shopify-hmac-sha256");

  if (!shopDomain) {
    throw new Error("Webhook is missing shop domain");
  }

  if (!verifyShopifyWebhookHmac(rawBody, hmac, config.apiSecret)) {
    throw new Error("Webhook HMAC verification failed");
  }

  console.log(`[SECURITY] Received SHOP_REDACT for shop: ${shopDomain}`);
  console.log(`[INFO] Deleting all shop-specific session data for: ${shopDomain}`);
  
  await deleteShopDataForShop(shopDomain, sessionStore, cleanupStores);
  
  console.log(`[INFO] Shop data deletion completed for: ${shopDomain}`);
}

export async function deleteShopDataForShop(
  shopDomain: string,
  sessionStore: SessionStore,
  cleanupStores: ShopDataCleanupStore[] = [],
): Promise<void> {
  await sessionStore.deleteShopSessions(shopDomain);

  const models = cleanupStores.flatMap((store) => [
    store.variantSnapshot,
    store.supplierMapping,
    store.salesVelocity,
    store.recommendation,
    store.supplier,
    store.shopSession,
  ]);

  await Promise.all(
    models
      .filter((model): model is DeleteManyModel => Boolean(model?.deleteMany))
      .map((model) => model.deleteMany({ where: { shop: shopDomain } })),
  );
}
