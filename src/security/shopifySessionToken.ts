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

    if (typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf) || claims.nbf > now) {
      return false;
    }

    if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= now) {
      return false;
    }

    const dest = claims.dest ? new URL(claims.dest) : null;
    const issuer = claims.iss ? new URL(claims.iss) : null;
    return dest?.origin === `https://${expectedShop}`
      && issuer?.origin === dest.origin && issuer?.pathname === "/admin";
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
