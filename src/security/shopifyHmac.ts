import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyShopifyQueryHmac(
  query: URLSearchParams,
  apiSecret: string,
): boolean {
  const receivedHmac = query.get("hmac");

  if (!receivedHmac) {
    return false;
  }

  const message = Array.from(query.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const expectedHmac = createHmac("sha256", apiSecret)
    .update(message)
    .digest("hex");

  return safeCompare(receivedHmac, expectedHmac);
}

export function verifyShopifyWebhookHmac(
  rawBody: string,
  receivedHmac: string | null,
  apiSecret: string,
): boolean {
  if (!receivedHmac) {
    return false;
  }

  const expectedHmac = createHmac("sha256", apiSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  return safeCompare(receivedHmac, expectedHmac);
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
