import type { SessionStore } from "../server/sessionStore.ts";

export type ShopifyGraphqlClient = {
  shop: string;
  graphql<TData>(query: string, variables?: Record<string, unknown>): Promise<TData>;
};

export type ShopifyAdminClientOptions = {
  apiVersion?: string;
  fetchImpl?: typeof fetch;
};

export class ShopifyAdminError extends Error {
  readonly code:
    | "unauthorized"
    | "throttled"
    | "shop_not_installed"
    | "network_error"
    | "graphql_error";
  readonly status?: number;

  constructor(
    code:
      | "unauthorized"
      | "throttled"
      | "shop_not_installed"
      | "network_error"
      | "graphql_error",
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "ShopifyAdminError";
    this.code = code;
    this.status = status;
  }
}

export async function createShopifyAdminClient(
  shop: string,
  sessionStore: SessionStore,
  options: ShopifyAdminClientOptions = {},
): Promise<ShopifyGraphqlClient> {
  const session = await sessionStore.load(shop);

  if (!session || !session.isInstalled) {
    throw new ShopifyAdminError(
      "shop_not_installed",
      `Shop ${shop} is not installed`,
      403,
    );
  }

  const apiVersion = options.apiVersion || "2026-04";
  const fetchImpl = options.fetchImpl || fetch;

  return {
    shop,
    async graphql<TData>(
      query: string,
      variables: Record<string, unknown> = {},
    ): Promise<TData> {
      let response: Response;

      try {
        response = await fetchImpl(
          `https://${shop}/admin/api/${apiVersion}/graphql.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": session.accessToken,
            },
            body: JSON.stringify({ query, variables }),
          },
        );
      } catch (error) {
        throw new ShopifyAdminError(
          "network_error",
          error instanceof Error ? error.message : "Shopify network request failed",
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new ShopifyAdminError(
          "unauthorized",
          "Shopify Admin API rejected the access token",
          response.status,
        );
      }

      if (response.status === 429) {
        throw new ShopifyAdminError(
          "throttled",
          "Shopify Admin API throttled the request",
          response.status,
        );
      }

      if (!response.ok) {
        throw new ShopifyAdminError(
          "network_error",
          `Shopify Admin API request failed with ${response.status}`,
          response.status,
        );
      }

      const payload = (await response.json()) as {
        data?: TData;
        errors?: Array<{ message: string }>;
      };

      if (payload.errors?.length) {
        throw new ShopifyAdminError(
          "graphql_error",
          payload.errors.map((error) => error.message).join("; "),
          response.status,
        );
      }

      if (!payload.data) {
        throw new ShopifyAdminError("graphql_error", "Shopify response did not include data");
      }

      return payload.data;
    },
  };
}
