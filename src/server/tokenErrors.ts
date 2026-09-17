export class ShopifyTokenError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(status === 401 ? "Your Shopify session needs to be renewed. Reload the app and try again." : "Shopify authentication is temporarily unavailable. Please retry.");
    this.name = "ShopifyTokenError";
    this.code = code;
    this.status = status;
  }
}
