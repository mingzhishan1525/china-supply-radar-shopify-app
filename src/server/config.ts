export type AppConfig = {
  apiKey: string;
  apiSecret: string;
  appUrl: string;
  scopes: string[];
  encryptionSecret: string;
  growthEngineApiUrl?: string;
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
  };
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
