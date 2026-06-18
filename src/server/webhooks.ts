import { verifyShopifyWebhookHmac } from "../security/shopifyHmac.ts";
import type { AppConfig } from "./config.ts";
import type { SessionStore } from "./sessionStore.ts";

export async function handleAppUninstalledWebhook(
  rawBody: string,
  headers: Headers,
  config: AppConfig,
  sessionStore: SessionStore,
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
  await sessionStore.markUninstalled(shopDomain, new Date().toISOString());
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
  
  // Delete all sessions for this shop
  await sessionStore.deleteShopSessions(shopDomain);
  
  console.log(`[INFO] Shop data deletion completed for: ${shopDomain}`);
}
