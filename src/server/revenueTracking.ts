import { createHmac } from "node:crypto";
import type { AppConfig } from "./config.ts";

type RevenueEventType = "INSTALL" | "SIGNUP" | "ACTIVATE" | "SUBSCRIPTION" | "CHURN";

type RevenueEventPayload = {
  eventType: RevenueEventType;
  shop: string;
  amount?: number;
  externalId?: string;
  assetId?: string;
  metadata?: Record<string, unknown>;
};

export function buildRevenueEventRequest(
  config: AppConfig,
  payload: RevenueEventPayload,
  timestamp = Math.floor(Date.now() / 1000),
): { body: string; headers: Record<string, string> } | null {
  if (!config.revenueOsWorkflowId || !config.revenueOsCampaignId) {
    return null;
  }

  const externalId = payload.externalId || `${payload.eventType.toLowerCase()}:shopify:${payload.shop}`;
  const body = JSON.stringify({
    workflow_id: config.revenueOsWorkflowId,
    campaign_id: config.revenueOsCampaignId,
    asset_id: payload.assetId || config.revenueOsAssetId || "",
    product: "china_supply_radar",
    source: "shopify",
    event_type: payload.eventType,
    user_id: "",
    tenant_id: payload.shop,
    amount: payload.amount || 0,
    currency: config.revenueOsCurrency,
    external_event_id: externalId,
    metadata_json: {
      shop: payload.shop,
      campaign_id: config.revenueOsCampaignId,
      asset_id: payload.assetId || config.revenueOsAssetId || "",
      ...payload.metadata,
    },
  });
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (config.revenueOsIngestSecret) {
    const timestampValue = String(timestamp);
    const digest = createHmac("sha256", config.revenueOsIngestSecret)
      .update(`${timestampValue}.${body}`, "utf8")
      .digest("hex");
    headers["X-Revenue-Timestamp"] = timestampValue;
    headers["X-Revenue-Signature"] = `v1=${digest}`;
  }

  return { body, headers };
}

export async function trackRevenueEvent(
  config: AppConfig,
  payload: RevenueEventPayload,
): Promise<void> {
  if (!config.revenueOsApiUrl) {
    return;
  }
  const request = buildRevenueEventRequest(config, payload);
  if (!request) {
    console.warn("[revenue-tracking] missing workflow or campaign identity");
    return;
  }

  try {
    const response = await fetch(`${config.revenueOsApiUrl}/api/revenue/events`, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`Revenue OS returned ${response.status}`);
    }
  } catch (error) {
    console.warn("[revenue-tracking] failed to send Shopify event", {
      eventType: payload.eventType,
      shop: payload.shop,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
