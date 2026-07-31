import { createHmac, timingSafeEqual } from "node:crypto";

const LINK_CODE_VERSION = 1;
const LINK_CODE_TTL_SECONDS = 60 * 60 * 24 * 30;

type LinkCodePayload = {
  v: number;
  shop: string;
  iat: number;
  exp: number;
};

export function createExtensionLinkCode(
  shop: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload: LinkCodePayload = {
    v: LINK_CODE_VERSION,
    shop,
    iat: nowSeconds,
    exp: nowSeconds + LINK_CODE_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function verifyExtensionLinkCode(
  code: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): LinkCodePayload {
  const [encodedPayload, suppliedSignature, extra] = code.split(".");

  if (!encodedPayload || !suppliedSignature || extra) {
    throw new ExtensionLinkCodeError("invalid_link_code", "Extension connection code is invalid");
  }

  const expectedSignature = sign(encodedPayload, secret);
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new ExtensionLinkCodeError("invalid_link_code", "Extension connection code is invalid");
  }

  let payload: LinkCodePayload;

  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as LinkCodePayload;
  } catch {
    throw new ExtensionLinkCodeError("invalid_link_code", "Extension connection code is invalid");
  }

  if (
    payload.v !== LINK_CODE_VERSION ||
    typeof payload.shop !== "string" ||
    !payload.shop.endsWith(".myshopify.com") ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp)
  ) {
    throw new ExtensionLinkCodeError("invalid_link_code", "Extension connection code is invalid");
  }

  if (payload.exp <= nowSeconds) {
    throw new ExtensionLinkCodeError("expired_link_code", "Extension connection code has expired");
  }

  return payload;
}

export class ExtensionLinkCodeError extends Error {
  readonly code: string;
  readonly status = 401;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ExtensionLinkCodeError";
    this.code = code;
  }
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}
