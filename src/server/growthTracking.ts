import type { AppConfig } from "./config.ts";

type GrowthEventType =
  | "VIEW"
  | "CLICK"
  | "SIGNUP"
  | "INSTALL"
  | "ACTIVATE"
  | "SUBSCRIPTION_START"
  | "SUBSCRIPTION_CANCEL";

type TrackGrowthEventPayload = {
  eventType: GrowthEventType;
  source: "shopify";
  shop: string;
  metadata?: Record<string, unknown>;
};

export async function trackGrowthEvent(
  config: AppConfig,
  payload: TrackGrowthEventPayload,
): Promise<void> {
  if (!config.growthEngineApiUrl) {
    return;
  }

  await fetch(`${config.growthEngineApiUrl}/api/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: payload.eventType,
      source: payload.source,
      visitor_id: payload.shop,
      session_id: payload.shop,
      metadata: {
        shop: payload.shop,
        ...payload.metadata,
      },
    }),
  }).catch((error) => {
    console.warn("[growth-tracking] failed to send Shopify event", {
      eventType: payload.eventType,
      shop: payload.shop,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
