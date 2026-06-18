import { randomBytes } from "node:crypto";
import { verifyShopifyQueryHmac } from "../security/shopifyHmac.ts";
import type { AppConfig } from "./config.ts";
import type { SessionStore } from "./sessionStore.ts";

export type OAuthStateStore = {
  put(state: string, shopDomain: string): Promise<void>;
  consume(state: string, shopDomain: string): Promise<boolean>;
};

export class MemoryOAuthStateStore implements OAuthStateStore {
  private readonly states = new Map<string, string>();

  async put(state: string, shopDomain: string): Promise<void> {
    this.states.set(state, shopDomain);
  }

  async consume(state: string, shopDomain: string): Promise<boolean> {
    const savedShopDomain = this.states.get(state);
    this.states.delete(state);

    return savedShopDomain === shopDomain;
  }
}

export async function buildOAuthStartUrl(
  shopDomain: string,
  config: AppConfig,
  stateStore: OAuthStateStore,
): Promise<string> {
  assertShopDomain(shopDomain);

  const state = randomBytes(16).toString("hex");
  await stateStore.put(state, shopDomain);

  const url = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  url.searchParams.set("client_id", config.apiKey);
  url.searchParams.set("scope", config.scopes.join(","));
  url.searchParams.set("redirect_uri", `${config.appUrl}/auth/callback`);
  url.searchParams.set("state", state);

  return url.toString();
}

export async function handleOAuthCallback(
  callbackUrl: string,
  config: AppConfig,
  stateStore: OAuthStateStore,
  sessionStore: SessionStore,
  exchangeAccessToken = exchangeShopifyAccessToken,
): Promise<{ shopDomain: string; redirectTo: string }> {
  const url = new URL(callbackUrl);
  const shopDomain = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!shopDomain || !code || !state) {
    throw new Error("OAuth callback is missing required parameters");
  }

  assertShopDomain(shopDomain);

  if (!verifyShopifyQueryHmac(url.searchParams, config.apiSecret)) {
    throw new Error("OAuth callback HMAC verification failed");
  }

  const stateIsValid = await stateStore.consume(state, shopDomain);

  if (!stateIsValid) {
    throw new Error("OAuth state verification failed");
  }

  const accessToken = await exchangeAccessToken(shopDomain, code, config);

  await sessionStore.save({
    shop: shopDomain,
    accessToken,
    scope: config.scopes.join(","),
  });

  return {
    shopDomain,
    redirectTo: `/?shop=${encodeURIComponent(shopDomain)}`,
  };
}

export async function exchangeShopifyAccessToken(
  shopDomain: string,
  code: string,
  config: AppConfig,
): Promise<string> {
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.apiKey,
      client_secret: config.apiSecret,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error(`Shopify token exchange failed with ${response.status}`);
  }

  const payload = (await response.json()) as { access_token?: string };

  if (!payload.access_token) {
    throw new Error("Shopify token exchange did not return access_token");
  }

  return payload.access_token;
}

function assertShopDomain(shopDomain: string): void {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain)) {
    throw new Error("Invalid Shopify shop domain");
  }
}
