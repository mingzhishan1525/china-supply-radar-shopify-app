import { createShopifyAdminClient, type ShopifyGraphqlClient } from "../shopify/adminClient.ts";
import type { AppConfig } from "./config.ts";
import type { SessionStore } from "./sessionStore.ts";

export const PRO_PLAN_NAME = "China Supply Radar Pro";
export const PRO_PLAN_AMOUNT = 29;
export const PRO_PLAN_CURRENCY = "USD";
export const MANAGED_PRICING_ERROR = "Managed Pricing Apps cannot use the Billing API";
export const APP_MANAGED_BILLING_FIX =
  "[FIX REQUIRED] Switch billing model to App-Managed Billing in Shopify Partner Dashboard";

export type BillingStatus = {
  active: boolean;
  plan: "FREE" | "PRO";
  subscribed: boolean;
  planName: string | null;
  status: string | null;
  subscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
};

type ActiveSubscriptionsPayload = {
  currentAppInstallation: {
    activeSubscriptions: Array<{
      id: string;
      name: string;
      status: string;
      currentPeriodEnd: string | null;
      lineItems: Array<{
        plan: {
          pricingDetails:
            | {
                __typename: "AppRecurringPricing";
                interval: string;
                price: {
                  amount: string;
                  currencyCode: string;
                };
              }
            | {
                __typename: string;
              };
        };
      }>;
    }>;
  };
};

type CreateSubscriptionPayload = {
  appSubscriptionCreate: {
    confirmationUrl: string | null;
    appSubscription: {
      id: string;
      status: string;
    } | null;
    userErrors: Array<{
      field: string[] | null;
      message: string;
    }>;
  };
};

type AppRecurringPricingDetails = {
  __typename: "AppRecurringPricing";
  interval: string;
  price: {
    amount: string;
    currencyCode: string;
  };
};

export class BillingConfigurationError extends Error {
  readonly code = "billing_model_conflict";
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "BillingConfigurationError";
  }
}

const ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query CurrentAppSubscription {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        currentPeriodEnd
        lineItems {
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing {
                interval
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  }
`;

const CREATE_SUBSCRIPTION_MUTATION = `#graphql
  mutation CreateProSubscription(
    $name: String!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $returnUrl: URL!
    $test: Boolean
  ) {
    appSubscriptionCreate(
      name: $name
      lineItems: $lineItems
      returnUrl: $returnUrl
      replacementBehavior: APPLY_IMMEDIATELY
      test: $test
    ) {
      confirmationUrl
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function getBillingStatusForShop(
  shop: string,
  sessionStore: SessionStore,
  client?: ShopifyGraphqlClient,
): Promise<BillingStatus> {
  const admin = client || await createShopifyAdminClient(shop, sessionStore);
  const payload = await admin.graphql<ActiveSubscriptionsPayload>(ACTIVE_SUBSCRIPTIONS_QUERY);
  const subscription = payload.currentAppInstallation.activeSubscriptions.find(isProSubscription);

  if (!subscription) {
    return {
      active: false,
      plan: "FREE",
      subscribed: false,
      planName: null,
      status: null,
      subscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    };
  }

  return {
    active: subscription.status === "ACTIVE",
    plan: subscription.status === "ACTIVE" ? "PRO" : "FREE",
    subscribed: subscription.status === "ACTIVE",
    planName: subscription.name,
    status: subscription.status,
    subscriptionId: subscription.id,
    cancelAtPeriodEnd: subscription.status !== "ACTIVE",
    currentPeriodEnd: subscription.currentPeriodEnd,
  };
}

export async function createProSubscriptionApprovalUrl(
  shop: string,
  config: AppConfig,
  sessionStore: SessionStore,
  client?: ShopifyGraphqlClient,
): Promise<string> {
  const admin = client || await createShopifyAdminClient(shop, sessionStore);
  const returnUrl = `${config.appUrl}/billing/return?shop=${encodeURIComponent(shop)}`;
  const payload = await admin.graphql<CreateSubscriptionPayload>(CREATE_SUBSCRIPTION_MUTATION, {
    name: PRO_PLAN_NAME,
    returnUrl,
    test: process.env.SHOPIFY_BILLING_TEST === "1",
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: {
              amount: PRO_PLAN_AMOUNT,
              currencyCode: PRO_PLAN_CURRENCY,
            },
            interval: "EVERY_30_DAYS",
          },
        },
      },
    ],
  });
  const errors = payload.appSubscriptionCreate.userErrors;

  if (errors.length) {
    const message = errors.map((error) => error.message).join("; ");

    if (message.includes(MANAGED_PRICING_ERROR)) {
      throw new BillingConfigurationError(
        `${APP_MANAGED_BILLING_FIX}. Shopify returned: ${message}`,
      );
    }

    throw new Error(message);
  }

  if (!payload.appSubscriptionCreate.confirmationUrl) {
    throw new Error("Shopify Billing did not return a confirmation URL");
  }

  return payload.appSubscriptionCreate.confirmationUrl;
}

function isProSubscription(subscription: ActiveSubscriptionsPayload["currentAppInstallation"]["activeSubscriptions"][number]) {
  return subscription.name === PRO_PLAN_NAME && subscription.lineItems.some((item) => {
    const pricing = item.plan.pricingDetails;

    if (pricing.__typename !== "AppRecurringPricing") {
      return false;
    }

    const recurringPricing = pricing as AppRecurringPricingDetails;

    return (
      recurringPricing.interval === "EVERY_30_DAYS" &&
      recurringPricing.price.currencyCode === PRO_PLAN_CURRENCY &&
      Number(recurringPricing.price.amount) === PRO_PLAN_AMOUNT
    );
  });
}
