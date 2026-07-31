export type AppConfig = {
  apiKey: string;
  apiSecret: string;
  appUrl: string;
  scopes: string[];
  encryptionSecret: string;
  growthEngineApiUrl?: string;
  revenueOsApiUrl?: string;
  revenueOsIngestSecret?: string;
  revenueOsWorkflowId?: string;
  revenueOsCampaignId?: string;
  revenueOsAssetId?: string;
  revenueOsPlanAmount: number;
  revenueOsCurrency: string;
};

const minimumEncryptionKeyLength = 32;

export function getAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const apiKey = requireEnv(env, "SHOPIFY_API_KEY");
  const apiSecret = requireEnv(env, "SHOPIFY_API_SECRET");
  const appUrl = requireEnv(env, "SHOPIFY_APP_URL").replace(/\/$/, "");
  const encryptionSecret = requireEnvAlias(
    env,
    "SESSION_ENCRYPTION_KEY",
    "ENCRYPTION_SECRET",
  );
  const scopes = (env.SHOPIFY_SCOPES || env.SCOPES || "read_products,read_inventory")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (encryptionSecret.length < minimumEncryptionKeyLength) {
    throw new Error(
      `SESSION_ENCRYPTION_KEY must be at least ${minimumEncryptionKeyLength} characters long`,
    );
  }

  if (!scopes.length) {
    throw new Error("SHOPIFY_SCOPES must include at least one scope");
  }

  return {
    apiKey,
    apiSecret,
    appUrl,
    scopes,
    encryptionSecret,
    growthEngineApiUrl: env.GROWTH_ENGINE_API_URL?.replace(/\/$/, "") || undefined,
    revenueOsApiUrl: env.REVENUE_OS_API_URL?.replace(/\/$/, "") || undefined,
    revenueOsIngestSecret: env.REVENUE_OS_INGEST_SECRET || undefined,
    revenueOsWorkflowId: env.REVENUE_OS_WORKFLOW_ID || undefined,
    revenueOsCampaignId: env.REVENUE_OS_CAMPAIGN_ID || undefined,
    revenueOsAssetId: env.REVENUE_OS_ASSET_ID || undefined,
    revenueOsPlanAmount: parseNonNegativeNumber(env.REVENUE_OS_PLAN_AMOUNT, 29),
    revenueOsCurrency: env.REVENUE_OS_CURRENCY || "USD",
  };
}

function parseNonNegativeNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function requireEnvAlias(
  env: NodeJS.ProcessEnv,
  primaryKey: string,
  legacyKey: string,
): string {
  const value = env[primaryKey] || env[legacyKey];

  if (!value) {
    throw new Error(`${primaryKey} is required`);
  }

  return value;
}
