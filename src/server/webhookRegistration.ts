import type { SessionStore } from "./sessionStore.ts";
import { createShopifyAdminClient, type ShopifyGraphqlClient } from "../shopify/adminClient.ts";

const REGISTER_APP_UNINSTALLED_WEBHOOK = `#graphql
  mutation RegisterAppUninstalledWebhook($callbackUrl: URL!) {
    webhookSubscriptionCreate(
      topic: APP_UNINSTALLED
      webhookSubscription: {
        callbackUrl: $callbackUrl
        format: JSON
      }
    ) {
      webhookSubscription {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

type RegisterWebhookPayload = {
  webhookSubscriptionCreate: {
    webhookSubscription: { id: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
};

export async function registerAppUninstalledWebhook(
  shop: string,
  appUrl: string,
  sessionStore: SessionStore,
  graphqlClient?: ShopifyGraphqlClient,
): Promise<void> {
  const admin = graphqlClient || (await createShopifyAdminClient(shop, sessionStore));
  const callbackUrl = new URL("/webhooks/app/uninstalled", appUrl).toString();
  const payload = await admin.graphql<RegisterWebhookPayload>(
    REGISTER_APP_UNINSTALLED_WEBHOOK,
    { callbackUrl },
  );
  const result = payload.webhookSubscriptionCreate;

  if (result.userErrors.length > 0) {
    const messages = result.userErrors.map((error) => error.message);
    const alreadyRegistered = messages.every((message) =>
      /already|taken|exists/i.test(message),
    );

    if (!alreadyRegistered) {
      throw new Error(`Shopify webhook registration failed: ${messages.join("; ")}`);
    }
  }

  if (!result.webhookSubscription && result.userErrors.length === 0) {
    throw new Error("Shopify webhook registration did not return a subscription");
  }

  console.log(`[SECURITY] Registered app/uninstalled webhook for shop: ${shop}`);
}
