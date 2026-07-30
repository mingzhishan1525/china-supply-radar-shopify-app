type TopLevelNavigator = {
  open: (url: string, target: string) => unknown;
};

/**
 * Shopify renders embedded apps inside an Admin iframe. Billing confirmation
 * pages cannot be displayed in that iframe, so the approval URL must replace
 * the top-level browsing context.
 */
export function redirectToShopifyBillingApproval(
  confirmationUrl: string,
  navigator: TopLevelNavigator = window,
): void {
  const approvalUrl = new URL(confirmationUrl);

  if (approvalUrl.protocol !== "https:") {
    throw new Error("Shopify Billing approval URL must use HTTPS");
  }

  navigator.open(approvalUrl.toString(), "_top");
}
