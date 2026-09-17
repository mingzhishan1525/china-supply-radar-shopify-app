import { withShopLifecycle } from "./shopLifecycle.ts";
import { verifyShopifySessionToken } from "../security/shopifySessionToken.ts";
import { exchangeShopifySessionTokenForOfflineAccessToken } from "./oauth.ts";
import { ShopifyTokenError } from "./tokenErrors.ts";
import type { AppConfig } from "./config.ts";
import type { SessionStore, ShopSession } from "./sessionStore.ts";

const exchanges = new WeakMap<SessionStore, Map<string, Promise<ShopSession>>>();
export async function authenticateShopRequest(shop: string, header: string | null | undefined, config: AppConfig, store: SessionStore) {
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) || !token || !verifyShopifySessionToken(token, shop, config)) {
    throw new ShopifyTokenError("invalid_session_token", 401);
  }
  const exchange = async () => {
    let pending = exchanges.get(store);
    if (!pending) { pending = new Map(); exchanges.set(store, pending); }
    const existing = pending.get(shop);
    if (existing) return existing;
    const task = withShopLifecycle(store, shop, async () => {
      try {
        const tokenSet = await exchangeShopifySessionTokenForOfflineAccessToken(shop, token, config);
        return await store.save({ shop, ...tokenSet, scope: tokenSet.scope || config.scopes.join(","), installedAt: new Date().toISOString() });
      } catch (error) {
        if (error instanceof ShopifyTokenError) throw error;
        if (error instanceof TypeError || (error instanceof Error && /Timeout|Abort/.test(error.name))) {
          throw new ShopifyTokenError("token_exchange_unavailable", 503);
        }
        throw error;
      }
    }).finally(() => pending!.delete(shop));
    pending.set(shop, task);
    return task;
  };
  let session: ShopSession | null;
  try { session = await store.load(shop); }
  catch (error) {
    if (!(error instanceof ShopifyTokenError)) throw error;
    session = null;
  }
  if (!session?.isInstalled || (session.accessTokenExpiresAt && Date.parse(session.accessTokenExpiresAt) <= Date.now())) session = await exchange();
  // Recovery exists only within this authenticated request, never for public callers.
  const scoped = new Proxy(store, { get(target, key) {
    if (key === "reauthorize") return async (requestedShop: string) => {
      if (requestedShop !== shop) throw new ShopifyTokenError("invalid_session_token", 401);
      return exchange();
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  }});
  return { session, store: scoped };
}
