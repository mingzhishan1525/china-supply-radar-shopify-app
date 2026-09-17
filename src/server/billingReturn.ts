import type { AppConfig } from "./config.ts";
export function embeddedAppUrl(shop: string, config: AppConfig): string {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) throw new Error("Invalid shop domain");
  return `https://${shop}/admin/apps/${encodeURIComponent(config.apiKey)}`;
}
