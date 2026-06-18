import { createHmac, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "../server/config.ts";

type SessionTokenClaims = {
  aud?: string;
  dest?: string;
  exp?: number;
  nbf?: number;
  iss?: string;
};

export function verifyShopifySessionToken(
  token: string,
  expectedShop: string,
  config: AppConfig,
  now = Math.floor(Date.now() / 1000),
): boolean {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return false;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8")) as { alg?: string };

    if (header.alg !== "HS256") {
      return false;
    }

    if (!signatureMatches(`${encodedHeader}.${encodedPayload}`, encodedSignature, config.apiSecret)) {
      return false;
    }

    const claims = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as SessionTokenClaims;

    if (claims.aud !== config.apiKey) {
      return false;
    }

    if (typeof claims.nbf === "number" && claims.nbf > now) {
      return false;
    }

    if (typeof claims.exp !== "number" || claims.exp <= now) {
      return false;
    }

    const destShop = claims.dest ? new URL(claims.dest).hostname : null;

    return destShop === expectedShop;
  } catch {
    return false;
  }
}

function signatureMatches(message: string, signature: string, apiSecret: string): boolean {
  const expectedSignature = createHmac("sha256", apiSecret).update(message).digest();
  const actualSignature = base64UrlDecode(signature);

  return (
    actualSignature.length === expectedSignature.length &&
    timingSafeEqual(actualSignature, expectedSignature)
  );
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
