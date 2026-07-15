import {
  AppProvider,
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  Divider,
  EmptyState,
  InlineGrid,
  InlineStack,
  Layout,
  List,
  Page,
  Select,
  Spinner,
  Tabs,
  Text,
  TextField,
  Banner,
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  calculateReorderRecommendation,
  type RiskLevel,
} from "../domain/reorder";
import {
  sampleAssumptionsByVariant,
  sampleHolidays,
  sampleVariants,
} from "../domain/sampleData";

const tabs = [
  { id: "overview", content: "Overview" },
  { id: "suppliers", content: "Suppliers" },
  { id: "orders", content: "Orders" },
  { id: "recommendations", content: "Recommendations" },
  { id: "holidays", content: "China Holiday Risk" },
  { id: "settings", content: "Settings" },
];

const dayMs = 24 * 60 * 60 * 1000;
const today = new Date("2026-06-12T00:00:00.000Z");
const emptyStateImage =
  "https://cdn.shopify.com/s/files/1/0759/7459/3952/files/empty-state-supply-chain.png";
const screenshotPreviews = [
  {
    title: "Dashboard",
    caption: "See store-level inventory health in one decision view.",
    src: "/screenshots/shopify-dashboard-overview.png",
  },
  {
    title: "Inventory risk",
    caption: "Spot SKUs moving toward stockout before they hurt revenue.",
    src: "/screenshots/shopify-inventory-health.png",
  },
  {
    title: "Reorder queue",
    caption: "Know which products to reorder and when.",
    src: "/screenshots/shopify-reorder-queue.png",
  },
  {
    title: "Holiday impact",
    caption: "Plan around China factory slowdowns and holiday closures.",
    src: "/screenshots/shopify-china-holiday-impact.png",
  },
];

const chinaHolidays = [
  {
    name: "Chinese New Year",
    startsOn: "2027-02-06T00:00:00.000Z",
    endsOn: "2027-02-20T00:00:00.000Z",
    riskLeadTimeDays: 90,
  },
  {
    name: "National Day",
    startsOn: "2026-10-01T00:00:00.000Z",
    endsOn: "2026-10-07T00:00:00.000Z",
    riskLeadTimeDays: 75,
  },
  {
    name: "Labor Day",
    startsOn: "2027-05-01T00:00:00.000Z",
    endsOn: "2027-05-05T00:00:00.000Z",
    riskLeadTimeDays: 45,
  },
  {
    name: "Mid-Autumn Festival",
    startsOn: "2026-09-25T00:00:00.000Z",
    endsOn: "2026-09-27T00:00:00.000Z",
    riskLeadTimeDays: 45,
  },
  {
    name: "Dragon Boat Festival",
    startsOn: "2026-06-19T00:00:00.000Z",
    endsOn: "2026-06-21T00:00:00.000Z",
    riskLeadTimeDays: 30,
  },
];

type ProductsState =
  | { status: "preview"; snapshots: VariantSnapshot[]; error?: undefined }
  | { status: "loading"; snapshots: VariantSnapshot[]; error?: undefined }
  | { status: "error"; snapshots: VariantSnapshot[]; error: string }
  | { status: "empty"; snapshots: VariantSnapshot[]; error?: undefined }
  | { status: "success"; snapshots: VariantSnapshot[]; error?: undefined };

type VariantSnapshot = {
  id?: string;
  shopifyVariantId: string;
  sku: string | null;
  title: string;
  productTitle: string;
  price: string | null;
  inventoryQuantity: number;
  syncedAt?: string;
  updatedAt?: string;
};

type Supplier = {
  id: string;
  name: string;
  city: string | null;
  contactName: string | null;
  contactEmail: string | null;
  leadTimeDays: number;
  moq: number | null;
  notes: string | null;
  riskLevel: string;
  isActive: boolean;
};

type SupplierMapping = {
  id: string;
  variantSnapshotId: string;
  supplierId: string;
  supplierSku: string | null;
  factoryLeadTimeDays: number;
  reorderBufferDays: number;
  moq: number | null;
  notes: string | null;
};

type Recommendation = {
  id: string;
  variantSnapshotId: string;
  supplierId: string | null;
  currentInventory: number;
  estimatedDailySales: number | null;
  inventoryCoverDays: number | null;
  stockoutDate: string | null;
  latestReorderDate: string | null;
  riskLevel: string;
  reason: string;
};

type SalesVelocity = {
  id: string;
  shopifyVariantId: string;
  variantSnapshotId: string;
  unitsSold: number;
  windowDays: number;
  estimatedDailySales: number;
  calculatedFrom: string;
  calculatedTo: string;
  updatedAt?: string;
};

type OrdersSyncResult = {
  ordersScanned: number;
  lineItemsScanned: number;
  variantsUpdated: number;
  matchedVariants: number;
  unmatchedLineItems: number;
  skippedCount: number;
  lastOrderCreatedAt: string | null;
  syncStartedAt: string;
  syncFinishedAt: string;
  windowDays: number;
  calculatedFrom: string;
  calculatedTo: string;
};

type BillingState =
  | { status: "unknown"; billing?: undefined; error?: undefined }
  | { status: "loading"; billing?: undefined; error?: undefined }
  | { status: "error"; billing?: undefined; error: string }
  | { status: "ready"; billing: BillingStatus; error?: undefined };

type BillingStatus = {
  active: boolean;
  plan: "FREE" | "PRO";
  subscribed: boolean;
  planName: string | null;
  status: string | null;
  subscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
};

type BillingStatusPayload = {
  shop: string;
  billing: BillingStatus;
};

type BillingSubscribePayload = {
  shop: string;
  confirmationUrl: string;
};

type ReorderQueueItem = {
  sku: string | null;
  productTitle: string;
  variantTitle: string;
  inventory: number;
  estimatedDailySales: number;
  inventoryCoverDays: number;
  recommendedReorderDate: string;
  riskLevel: string;
};

type ProductInsight = {
  shopifyVariantId: string;
  productTitle: string;
  variantTitle: string;
  sku?: string;
  supplierName?: string;
  inventoryQuantity: number;
  inventoryCoverageLabel: string;
  latestReorderLabel: string;
  riskLabel: string;
  riskTone: "critical" | "warning" | "attention" | "success" | "info";
};

type SupplierDraft = {
  name: string;
  city: string;
  contactEmail: string;
  leadTimeDays: string;
  notes: string;
  riskLevel: string;
};

type UpcomingStockoutItem = {
  sku: string;
  product: string;
  inventory: number;
  estimatedDailySales: number;
  inventoryCoverDays: number;
  riskLevel: string;
};

type BadgeTone = "attention" | "critical" | "info" | "success" | "warning";

type SkuRiskCard = {
  id: string;
  productName: string;
  stock: number;
  coverageDays: string;
  riskLevel: string;
  tone: BadgeTone;
};

declare global {
  interface Window {
    shopify?: {
      idToken?: () => Promise<string>;
    };
  }
}

// Get host and shop from URL for App Bridge
function getHostFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("host");
}

function getShopFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("shop");
}

function getDemoModeFromUrl(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const isExplicitDemo = searchParams.get("demoMode") === "1";
  const isLocalPreview =
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
    !searchParams.get("shop") &&
    !searchParams.get("host");

  return isExplicitDemo || isLocalPreview;
}

export default function App() {
  const [selectedTab, setSelectedTab] = useState(0);
  const [productsState, setProductsState] = useState<ProductsState>({
    status: "preview",
    snapshots: [],
  });
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [mappings, setMappings] = useState<SupplierMapping[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [salesVelocity, setSalesVelocity] = useState<SalesVelocity[]>([]);
  const [reorderQueue, setReorderQueue] = useState<ReorderQueueItem[]>([]);
  const [ordersSyncResult, setOrdersSyncResult] = useState<OrdersSyncResult | null>(null);
  const [billingState, setBillingState] = useState<BillingState>({ status: "unknown" });
  const [isSyncingProducts, setIsSyncingProducts] = useState(false);
  const [isSyncingOrders, setIsSyncingOrders] = useState(false);
  const [isStartingBilling, setIsStartingBilling] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const shop = getShopFromUrl();
  const host = getHostFromUrl();
  const demoMode = getDemoModeFromUrl();

  useEffect(() => {
    if (demoMode) {
      return;
    }

    console.info("[Shopify embedded context]", {
      host,
      shop,
      hasShopifyGlobal: typeof window !== "undefined" && Boolean(window.shopify),
      hasIdToken: typeof window !== "undefined" && Boolean(window.shopify?.idToken),
    });
  }, [demoMode, host, shop]);

  const loadSupplyChainData = async () => {
    if (!shop) {
      return;
    }

    await Promise.all([
      fetchJson<{ suppliers: Supplier[] }>(`/api/suppliers?shop=${encodeURIComponent(shop)}`),
      fetchJson<{ mappings: SupplierMapping[] }>(`/api/supplier-mappings?shop=${encodeURIComponent(shop)}`),
      fetchJson<{ recommendations: Recommendation[] }>(`/api/recommendations?shop=${encodeURIComponent(shop)}`),
      fetchJson<{ salesVelocity: SalesVelocity[] }>(`/api/sales-velocity?shop=${encodeURIComponent(shop)}`),
      fetchJson<{ queue: ReorderQueueItem[] }>(`/api/reorder-queue?shop=${encodeURIComponent(shop)}`),
    ])
      .then(([suppliersPayload, mappingsPayload, recommendationsPayload, velocityPayload, queuePayload]) => {
        setSuppliers(suppliersPayload.suppliers);
        setMappings(mappingsPayload.mappings);
        setRecommendations(recommendationsPayload.recommendations);
        setSalesVelocity(velocityPayload.salesVelocity);
        setReorderQueue(queuePayload.queue);
        setDataError(null);
      })
      .catch((error) => {
        setDataError(error instanceof Error ? error.message : "Unable to load supplier data");
      });
  };

  const loadProducts = async () => {
    if (!shop) {
      return [];
    }

    const payload = await fetchJson<{ products: VariantSnapshot[] }>(
      `/api/products?shop=${encodeURIComponent(shop)}`,
    );

    setProductsState({
      status: payload.products.length ? "success" : "empty",
      snapshots: payload.products,
    });

    return payload.products;
  };

  const syncProducts = async () => {
    if (!shop) {
      return;
    }

    setIsSyncingProducts(true);
    setProductsState((current) => ({
      status: "loading",
      snapshots: current.snapshots,
    }));

    try {
      await fetchJson(`/api/sync/products?shop=${encodeURIComponent(shop)}`, {
        method: "POST",
      });
      await loadProducts();
      await loadSupplyChainData();
      setDataError(null);
    } catch (error) {
      setProductsState({
        status: "error",
        snapshots: [],
        error: error instanceof Error ? error.message : "Unable to sync products from Shopify",
      });
    } finally {
      setIsSyncingProducts(false);
    }
  };

  const syncOrders = async () => {
    if (!shop) {
      return;
    }

    setIsSyncingOrders(true);
    try {
      const result = await fetchJson<OrdersSyncResult>(
        `/api/sync/orders?shop=${encodeURIComponent(shop)}&windowDays=30`,
        { method: "POST" },
      );
      setOrdersSyncResult(result);
      await fetchJson(`/api/recommendations/generate?shop=${encodeURIComponent(shop)}`, {
        method: "POST",
      });
      await loadSupplyChainData();
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Unable to sync orders");
    } finally {
      setIsSyncingOrders(false);
    }
  };

  useEffect(() => {
    if (!shop) {
      return;
    }

    let isActive = true;
    setProductsState({ status: "loading", snapshots: [] });

    fetchJson<{ products: VariantSnapshot[] }>(`/api/products?shop=${encodeURIComponent(shop)}`)
      .then((payload) => {
        if (!isActive) {
          return;
        }

        if (payload.products.length === 0) {
          setIsSyncingProducts(true);
          return fetchJson(`/api/sync/products?shop=${encodeURIComponent(shop)}`, {
            method: "POST",
          })
            .then(() => fetchJson<{ products: VariantSnapshot[] }>(`/api/products?shop=${encodeURIComponent(shop)}`))
            .then((syncedPayload) => {
              if (!isActive) {
                return;
              }

              setProductsState({
                status: syncedPayload.products.length ? "success" : "empty",
                snapshots: syncedPayload.products,
              });
            })
            .finally(() => {
              if (isActive) {
                setIsSyncingProducts(false);
              }
            });
        }

        setProductsState({
          status: "success",
          snapshots: payload.products,
        });
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setProductsState({
          status: "error",
          snapshots: [],
          error: error instanceof Error ? error.message : "Unable to load products",
        });
      });

    loadSupplyChainData();

    return () => {
      isActive = false;
    };
  }, [shop]);

  useEffect(() => {
    if (!shop) {
      return;
    }

    let isActive = true;
    setBillingState({ status: "loading" });

    fetchJson<BillingStatusPayload>(`/api/billing/status?shop=${encodeURIComponent(shop)}`)
      .then((payload) => {
        if (isActive) {
          setBillingState({ status: "ready", billing: payload.billing });
        }
      })
      .catch((error) => {
        if (isActive) {
          setBillingState({
            status: "error",
            error: error instanceof Error ? error.message : "Unable to load billing status",
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [shop]);

  const startBilling = async () => {
    if (!shop) {
      return;
    }

    setIsStartingBilling(true);
    try {
      const payload = await fetchJson<BillingSubscribePayload>(
        `/api/billing/create?shop=${encodeURIComponent(shop)}`,
        { method: "POST" },
      );
      window.location.assign(payload.confirmationUrl);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Unable to start Shopify Billing");
    } finally {
      setIsStartingBilling(false);
    }
  };

  const productInsights = useMemo(
    () => buildProductInsights(productsState, demoMode),
    [demoMode, productsState],
  );
  const currentPath = typeof window === "undefined" ? "/" : window.location.pathname;

  if (currentPath === "/landing") {
    return (
      <AppProvider i18n={enTranslations}>
        <LandingPage />
      </AppProvider>
    );
  }

  if (currentPath === "/onboarding") {
    return (
      <AppProvider i18n={enTranslations}>
        <OnboardingPage />
      </AppProvider>
    );
  }

  if (currentPath === "/privacy-policy") {
    return (
      <AppProvider i18n={enTranslations}>
        <PrivacyPolicyPage />
      </AppProvider>
    );
  }

  if (currentPath === "/terms-of-service") {
    return (
      <AppProvider i18n={enTranslations}>
        <TermsOfServicePage />
      </AppProvider>
    );
  }

  // Show loading if host is missing (not in embedded context)
  if (!host && !shop && !demoMode) {
    return (
      <AppProvider i18n={enTranslations}>
        <Page title="China Supply Radar">
          <BlockStack gap="500" align="center">
            <Spinner size="large" />
            <Text as="p" variant="headingMd" tone="subdued">Loading app...</Text>
          </BlockStack>
        </Page>
      </AppProvider>
    );
  }

  if (productsState.status === "loading") {
    return (
      <AppProvider i18n={enTranslations}>
        <Page title="China Supply Radar">
          <BlockStack gap="500" align="center">
            <Spinner size="large" />
            <Text as="p" variant="headingMd" tone="subdued">Loading your supply chain data...</Text>
          </BlockStack>
        </Page>
      </AppProvider>
    );
  }

  const appContent = (
    <Page
      title="China Supply Radar"
      subtitle="Avoid stockouts from Chinese factory holidays. Optimize reorder timing based on real sales data and supplier lead times."
      primaryAction={<Button variant="primary" onClick={syncOrders} loading={isSyncingOrders}>Sync Order History</Button>}
      secondaryActions={[
        <Button onClick={syncProducts} loading={isSyncingProducts}>
          Sync Products & Inventory
        </Button>,
      ]}
    >
      <Tabs
        tabs={tabs}
        selected={selectedTab}
        onSelect={setSelectedTab}
        fitted
      />
      <Box paddingBlockStart="500">
        {selectedTab === 0 ? (
          <Overview
            productInsights={productInsights}
            productsState={productsState}
            suppliers={suppliers}
            recommendations={recommendations}
            salesVelocity={salesVelocity}
            reorderQueue={reorderQueue}
            ordersSyncResult={ordersSyncResult}
            isSyncingOrders={isSyncingOrders}
            isSyncingProducts={isSyncingProducts}
            demoMode={demoMode}
            dataError={dataError}
            onSyncOrders={syncOrders}
            onSyncProducts={syncProducts}
            billingState={billingState}
            isStartingBilling={isStartingBilling}
            onStartBilling={startBilling}
          />
        ) : null}
        {selectedTab === 1 ? (
          <Suppliers
            shop={shop}
            suppliers={suppliers}
            onChanged={loadSupplyChainData}
          />
        ) : null}
        {selectedTab === 2 ? (
          <Orders
            products={productsState.snapshots}
            ordersSyncResult={ordersSyncResult}
            salesVelocity={salesVelocity}
            isSyncingOrders={isSyncingOrders}
            onSyncOrders={syncOrders}
          />
        ) : null}
        {selectedTab === 3 ? (
          <Recommendations
            recommendations={recommendations}
            reorderQueue={reorderQueue}
            products={productsState.snapshots}
            suppliers={suppliers}
            productInsights={productInsights}
            isSyncingOrders={isSyncingOrders}
            onSyncOrders={syncOrders}
          />
        ) : null}
        {selectedTab === 4 ? <HolidayCalendar /> : null}
        {selectedTab === 5 ? (
          <Settings
            billingState={billingState}
            isStartingBilling={isStartingBilling}
            onStartBilling={startBilling}
          />
        ) : null}
      </Box>
    </Page>
  );

  return (
    <AppProvider i18n={enTranslations}>
      {appContent}
    </AppProvider>
  );
}

function LandingPage() {
  return (
    <div className="landingPage">
      <section className="landingHero">
        <div className="landingShell landingHeroGrid">
          <BlockStack gap="500">
            <Badge tone="success">Shopify inventory risk prediction</Badge>
            <BlockStack gap="300">
              <h1>Prevent Stockouts Before They Happen</h1>
              <p>
                Predict inventory risks and reorder timing using real Shopify sales data and China supply chain signals.
              </p>
            </BlockStack>
            <InlineStack gap="300">
              <Button variant="primary" url="/onboarding">Start Free Trial</Button>
              <Button url="/onboarding">Install App</Button>
            </InlineStack>
          </BlockStack>
          <div className="heroPreview" aria-label="China Supply Radar product preview">
            <img src="/screenshots/shopify-dashboard-overview.png" alt="China Supply Radar dashboard preview" />
          </div>
        </div>
      </section>

      <section className="landingBand">
        <div className="landingShell">
          <div className="valueGrid">
            {[
              "Predict inventory shortages before they happen",
              "Avoid China holiday production delays",
              "Know exactly when to reorder each SKU",
            ].map((item) => (
              <div className="valueCard" key={item}>
                <span />
                <strong>{item}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landingSection">
        <div className="landingShell">
          <div className="sectionHeading">
            <h2>How it works</h2>
          </div>
          <div className="stepsGrid">
            {[
              "Connect your Shopify store",
              "We analyze sales + inventory data",
              "Get reorder recommendations automatically",
            ].map((step, index) => (
              <div className="stepCard" key={step}>
                <span>{index + 1}</span>
                <h3>{step}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landingSection previewSection">
        <div className="landingShell">
          <div className="sectionHeading">
            <h2>Product preview</h2>
          </div>
          <div className="screenshotGrid">
            {screenshotPreviews.map((preview) => (
              <article className="screenshotCard" key={preview.title}>
                <img src={preview.src} alt={`${preview.title} screenshot`} />
                <div>
                  <h3>{preview.title}</h3>
                  <p>{preview.caption}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landingSection">
        <div className="landingShell">
          <div className="sectionHeading">
            <h2>Pricing</h2>
          </div>
          <div className="pricingGrid">
            <PlanCard
              name="Free"
              price="$0"
              features={["3 SKUs monitoring", "Basic inventory dashboard", "Limited insights"]}
              action="Start Free"
            />
            <PlanCard
              name="Pro"
              price="$29/month"
              featured
              features={[
                "Unlimited SKUs",
                "Inventory risk prediction",
                "Reorder forecasting",
                "China holiday delay detection",
                "Supplier risk insights",
                "Weekly alerts",
              ]}
              action="Start $29/month"
            />
          </div>
        </div>
      </section>

      <section className="finalCta">
        <div className="landingShell">
          <h2>Never miss a stockout again</h2>
          <Button variant="primary" url="/onboarding">Start $29/month</Button>
        </div>
      </section>
    </div>
  );
}

function PlanCard({
  name,
  price,
  features,
  action,
  featured = false,
}: {
  name: string;
  price: string;
  features: string[];
  action: string;
  featured?: boolean;
}) {
  return (
    <article className={featured ? "planCard planCardFeatured" : "planCard"}>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <h3>{name}</h3>
          <p>{price}</p>
        </BlockStack>
        <ul>
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
        <Button variant={featured ? "primary" : undefined} url="/onboarding">{action}</Button>
      </BlockStack>
    </article>
  );
}

function OnboardingPage() {
  return (
    <div className="onboardingPage">
      <div className="onboardingShell">
        <BlockStack gap="500">
          <BlockStack gap="200">
            <Badge tone="success">Setup preview</Badge>
            <h1>Inventory prediction is ready</h1>
          </BlockStack>
          <div className="onboardingSteps">
            {[
              "Connect your Shopify store",
              "Analyzing your inventory...",
              "You are safe for next 300 days",
              "Unlock advanced predictions for $29/month",
            ].map((step, index) => (
              <div className={index === 2 ? "onboardingStep onboardingResult" : "onboardingStep"} key={step}>
                <span>{`Step ${index + 1}`}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
          <InlineStack gap="300">
            <Button variant="primary" url="/?demoMode=1">Open dashboard</Button>
            <Button>Start $29/month</Button>
          </InlineStack>
        </BlockStack>
      </div>
    </div>
  );
}

function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="July 3, 2026">
      <h2>Overview</h2>
      <p>
        China Supply Radar helps Shopify merchants monitor inventory, forecast reorder timing, and plan around China supply chain delays.
        This policy explains what data we use and how we protect it.
      </p>
      <h2>Data We Process</h2>
      <ul>
        <li>Shop domain, installation status, app scopes, and encrypted access token.</li>
        <li>Product, variant, inventory, SKU, and price data from Shopify.</li>
        <li>Order line item quantities, variant IDs, order created dates, and cancellation status for sales velocity calculation.</li>
        <li>Supplier names, lead times, notes, and supplier mappings entered by the merchant.</li>
      </ul>
      <h2>Data We Do Not Store</h2>
      <ul>
        <li>Customer names, emails, phone numbers, shipping addresses, billing addresses, or payment information.</li>
        <li>Credit card details or Shopify billing payment credentials.</li>
      </ul>
      <h2>How Data Is Used</h2>
      <p>
        Data is used to calculate daily sales, stock coverage, reorder recommendations, supplier risk, and China holiday delay alerts.
        The app does not write orders, modify checkout, or change Shopify store data.
      </p>
      <h2>Retention And Deletion</h2>
      <p>
        Access tokens are encrypted at rest. When the app is uninstalled, shop session/token data and app-specific shop data are deleted.
        Shopify GDPR webhooks are supported for customer data requests, customer redaction, and shop redaction.
      </p>
      <h2>Contact</h2>
      <p>For privacy requests, contact the app owner through the Shopify App Store listing support channel.</p>
    </LegalPage>
  );
}

function TermsOfServicePage() {
  return (
    <LegalPage title="Terms of Service" updated="July 3, 2026">
      <h2>Service</h2>
      <p>
        China Supply Radar provides informational inventory planning, reorder forecasting, and China holiday delay detection for Shopify merchants.
      </p>
      <h2>Merchant Responsibility</h2>
      <p>
        Recommendations are planning signals only. You remain responsible for purchasing, inventory, supplier, legal, tax, and financial decisions.
      </p>
      <h2>Billing</h2>
      <p>
        Paid subscriptions must be processed through Shopify Billing. The public Pro plan is $29/month when billing is enabled and approved.
      </p>
      <h2>Acceptable Use</h2>
      <p>
        You agree to use the service in compliance with Shopify terms, applicable laws, and your supplier agreements.
      </p>
      <h2>Limitations</h2>
      <p>
        We do not guarantee that recommendations will prevent every stockout, overstock, shipping delay, supplier delay, or business loss.
      </p>
      <h2>Termination</h2>
      <p>
        You may stop using the service by uninstalling the app from your Shopify store. On uninstall, app access to your store is removed and stored app data is deleted.
      </p>
    </LegalPage>
  );
}

function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="legalPage">
      <main className="legalShell">
        <BlockStack gap="500">
          <BlockStack gap="200">
            <Badge tone="info">China Supply Radar</Badge>
            <h1>{title}</h1>
            <p className="legalUpdated">Last updated: {updated}</p>
          </BlockStack>
          <div className="legalContent">{children}</div>
        </BlockStack>
      </main>
    </div>
  );
}

function Overview({
  productInsights,
  productsState,
  suppliers,
  recommendations,
  salesVelocity,
  reorderQueue,
  ordersSyncResult,
  isSyncingOrders,
  isSyncingProducts,
  demoMode,
  dataError,
  onSyncOrders,
  onSyncProducts,
  billingState,
  isStartingBilling,
  onStartBilling,
}: {
  productInsights: ProductInsight[];
  productsState: ProductsState;
  suppliers: Supplier[];
  recommendations: Recommendation[];
  salesVelocity: SalesVelocity[];
  reorderQueue: ReorderQueueItem[];
  ordersSyncResult: OrdersSyncResult | null;
  isSyncingOrders: boolean;
  isSyncingProducts: boolean;
  demoMode: boolean;
  dataError: string | null;
  onSyncOrders: () => void;
  onSyncProducts: () => void;
  billingState: BillingState;
  isStartingBilling: boolean;
  onStartBilling: () => void;
}) {
  const summary = getDashboardSummary(
    productsState,
    productInsights,
    recommendations,
    salesVelocity,
    ordersSyncResult,
    demoMode,
  );
  const upcomingStockouts = getUpcomingStockouts(recommendations, productsState.snapshots);
  const holidayImpact = getNextHolidayImpact(new Date());
  const readiness = getDemoReadiness({
    productsState,
    ordersSyncResult,
    salesVelocity,
    recommendations,
    reorderQueue,
    holidayImpact,
  });
  const decision = getInventoryDecision(
    productsState,
    summary,
    recommendations,
    salesVelocity,
    reorderQueue,
    ordersSyncResult,
    demoMode,
  );
  const kpis = getDecisionKpis(
    productsState,
    summary,
    recommendations,
    salesVelocity,
    reorderQueue,
    ordersSyncResult,
    demoMode,
  );
  const skuCards = getSkuCards(productInsights, recommendations, productsState.snapshots);

  return (
    <Layout>
      <Layout.Section>
        <ProductsStateBanner
          productsState={productsState}
          loading={isSyncingProducts}
          onSyncProducts={onSyncProducts}
        />
      </Layout.Section>
      {dataError && (
        <Layout.Section>
          <Banner tone="critical">
            <p>{dataError}</p>
          </Banner>
        </Layout.Section>
      )}
      <Layout.Section>
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="start" gap="400">
              <BlockStack gap="200">
                <Text as="p" variant="headingSm" tone="subdued">Inventory Status</Text>
                <InlineStack gap="300" blockAlign="center">
                  <Text as="h1" variant="heading2xl">{decision.status}</Text>
                  <Badge tone={decision.tone}>{decision.status}</Badge>
                </InlineStack>
                <Text as="p" variant="headingLg">{decision.message}</Text>
              </BlockStack>
              <BillingButton
                billingState={billingState}
                loading={isStartingBilling}
                onStartBilling={onStartBilling}
              />
            </InlineStack>
          </BlockStack>
        </Card>
      </Layout.Section>
      <Layout.Section>
        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          {kpis.map((metric) => (
            <MetricCard key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
          ))}
        </InlineGrid>
      </Layout.Section>
      <Layout.Section>
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Recommended Action</Text>
            <Text as="p" variant="headingLg">{decision.action}</Text>
            <InlineStack gap="300">
              <Button variant={decision.status === "Healthy" ? undefined : "primary"}>
                {decision.status === "Healthy" ? "Review inventory" : "Open reorder queue"}
              </Button>
              <Button onClick={onSyncOrders} loading={isSyncingOrders}>Refresh recommendations</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </Layout.Section>
      <Layout.Section>
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">SKU Risk List</Text>
              <Text as="p" tone="subdued">Stock, coverage, and risk by product</Text>
            </InlineStack>
            <SkuRiskCards items={skuCards} />
          </BlockStack>
        </Card>
      </Layout.Section>
      <Layout.Section>
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">China Holiday Impact</Text>
              <Text as="p" tone="subdued">Next production delay window</Text>
            </InlineStack>
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
              <SyncResultMetric label="Next holiday" value={holidayImpact.name} />
              <SyncResultMetric label="Days remaining" value={holidayImpact.daysRemaining} />
              <SyncResultMetric label="Order before" value={holidayImpact.orderBeforeDate} />
            </InlineGrid>
          </BlockStack>
        </Card>
      </Layout.Section>
      <Layout.Section>
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Prevent Stockouts Before They Happen</Text>
            <Text as="p" tone="subdued">
              Predict inventory risk, detect China holiday delays, and identify slow-moving SKUs.
            </Text>
            <BillingSummary billingState={billingState} />
            <BillingButton
              billingState={billingState}
              loading={isStartingBilling}
              onStartBilling={onStartBilling}
            />
          </BlockStack>
        </Card>
      </Layout.Section>
    </Layout>
  );
}

function BillingButton({
  billingState,
  loading,
  onStartBilling,
}: {
  billingState: BillingState;
  loading: boolean;
  onStartBilling: () => void;
}) {
  if (billingState.status === "ready" && billingState.billing.subscribed) {
    return <Button disabled>Subscription active</Button>;
  }

  return (
    <Button
      variant="primary"
      onClick={onStartBilling}
      loading={loading || billingState.status === "loading"}
    >
      Start $29/month
    </Button>
  );
}

function BillingSummary({ billingState }: { billingState: BillingState }) {
  if (billingState.status === "loading") {
    return <Text as="p" tone="subdued">Checking Shopify subscription status...</Text>;
  }

  if (billingState.status === "error") {
    return <Text as="p" tone="critical">Billing status unavailable: {billingState.error}</Text>;
  }

  if (billingState.status === "ready" && billingState.billing.subscribed) {
    return <Text as="p" tone="success">Shopify subscription active.</Text>;
  }

  if (billingState.status === "ready" && billingState.billing.status) {
    return (
      <Text as="p" tone="critical">
        Shopify subscription status is {billingState.billing.status}. Start billing again to restore Pro access.
      </Text>
    );
  }

  return <Text as="p" tone="subdued">Pro access requires Shopify Billing approval.</Text>;
}

function Orders({
  products,
  ordersSyncResult,
  salesVelocity,
  isSyncingOrders,
  onSyncOrders,
}: {
  products: VariantSnapshot[];
  ordersSyncResult: OrdersSyncResult | null;
  salesVelocity: SalesVelocity[];
  isSyncingOrders: boolean;
  onSyncOrders: () => void;
}) {
  const productByVariantId = new Map(products.map((product) => [product.shopifyVariantId, product]));

  if (!ordersSyncResult || salesVelocity.length === 0) {
    return (
      <Card>
        <EmptyState
          heading="No order history synced yet"
          action={{
            content: "Sync Order History",
            onAction: onSyncOrders,
            loading: isSyncingOrders,
          }}
          image={emptyStateImage}
        >
          <p>Sync your Shopify order history to calculate sales velocity and accurate reorder timing recommendations for Chinese holidays.</p>
        </EmptyState>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h2" variant="headingMd">Order Sync Status</Text>
            <Button onClick={onSyncOrders} loading={isSyncingOrders}>Sync Order History</Button>
          </InlineStack>
          <InlineGrid columns={{ xs: 1, md: 4 }} gap="300">
            <SyncResultMetric label="Orders scanned" value={ordersSyncResult.ordersScanned.toString()} />
            <SyncResultMetric label="Products with sales" value={salesVelocity.length.toString()} />
            <SyncResultMetric label="Daily sales ready" value={salesVelocity.length ? "Yes" : "Pending"} />
            <SyncResultMetric label="Analysis window" value={`${ordersSyncResult.windowDays} days`} />
          </InlineGrid>
          {ordersSyncResult?.lastOrderCreatedAt && (
            <Text as="p" tone="subdued">
              Last order seen: {formatDateTime(ordersSyncResult.lastOrderCreatedAt)}.
            </Text>
          )}
        </BlockStack>
      </Card>
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Sales Velocity by Product</Text>
          <DataTable
            columnContentTypes={["text", "numeric", "numeric"]}
            headings={["Product", "Units sold (30 days)", "Estimated daily sales"]}
            rows={salesVelocity.map((velocity) => {
              const product = productByVariantId.get(velocity.shopifyVariantId);
              return [
                product ? `${product.productTitle} / ${product.title}` : velocity.shopifyVariantId,
                velocity.unitsSold,
                velocity.estimatedDailySales.toFixed(2),
              ];
            })}
          />
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

function Recommendations({
  recommendations,
  reorderQueue,
  products,
  suppliers,
  productInsights,
  isSyncingOrders,
  onSyncOrders,
}: {
  recommendations: Recommendation[];
  reorderQueue: ReorderQueueItem[];
  products: VariantSnapshot[];
  suppliers: Supplier[];
  productInsights: ProductInsight[];
  isSyncingOrders: boolean;
  onSyncOrders: () => void;
}) {
  if (recommendations.length === 0) {
    return (
      <Card>
        <EmptyState
          heading="No reorder recommendations yet"
          action={{
            content: "Sync Orders & Map Suppliers",
            onAction: onSyncOrders,
            loading: isSyncingOrders,
          }}
          image={emptyStateImage}
        >
          <p>Sync your order history and map products to Chinese suppliers to get personalized reorder timing recommendations based on upcoming factory holidays.</p>
        </EmptyState>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Recommended Reorder Timing</Text>
          <RecommendationTable
            productInsights={productInsights}
            recommendations={recommendations}
            products={products}
            suppliers={suppliers}
          />
        </BlockStack>
      </Card>
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Reorder Queue</Text>
          <ReorderQueueTable items={reorderQueue} hasSalesVelocity={true} />
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

function Suppliers({
  shop,
  suppliers,
  onChanged,
}: {
  shop: string | null;
  suppliers: Supplier[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<SupplierDraft>({
    name: "",
    city: "",
    contactEmail: "",
    leadTimeDays: "30",
    notes: "",
    riskLevel: "medium",
  });

  const create = async () => {
    if (!shop || !draft.name.trim()) {
      return;
    }

    await fetchJson(`/api/suppliers?shop=${encodeURIComponent(shop)}`, {
      method: "POST",
      body: JSON.stringify({
        ...draft,
        leadTimeDays: Number.parseInt(draft.leadTimeDays, 10) || 30,
      }),
    });

    setDraft({
      name: "",
      city: "",
      contactEmail: "",
      leadTimeDays: "30",
      notes: "",
      riskLevel: "medium",
    });

    onChanged();
  };

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Add China Supplier</Text>
          {suppliers.length === 0 ? (
            <Text as="p" tone="subdued">
              Add supplier lead times to detect China holiday delays and reorder risk by SKU.
            </Text>
          ) : null}
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
            <TextField label="Name" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} autoComplete="off" />
            <TextField label="City" value={draft.city} onChange={(value) => setDraft({ ...draft, city: value })} autoComplete="off" />
            <TextField label="Contact email" value={draft.contactEmail} onChange={(value) => setDraft({ ...draft, contactEmail: value })} autoComplete="off" />
            <TextField label="Lead time days" type="number" value={draft.leadTimeDays} onChange={(value) => setDraft({ ...draft, leadTimeDays: value })} autoComplete="off" />
          </InlineGrid>
          <TextField label="Notes" value={draft.notes} onChange={(value) => setDraft({ ...draft, notes: value })} autoComplete="off" multiline={3} />
          <Button variant="primary" onClick={create} disabled={!shop || !draft.name.trim()}>Add supplier</Button>
        </BlockStack>
      </Card>
      {suppliers.length === 0 ? (
        <Card>
          <Text as="p" tone="subdued">
            No suppliers configured yet. Add a supplier above, then map Shopify products to supplier lead times.
          </Text>
        </Card>
      ) : null}
      <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
      {suppliers.map((supplier) => (
        <Card key={supplier.id}>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                {supplier.name}
              </Text>
              <Badge tone={supplier.riskLevel === "unknown" ? "info" : "warning"}>{`${supplier.riskLevel} risk`}</Badge>
            </InlineStack>
            <List>
              <List.Item>Lead time: {supplier.leadTimeDays} days</List.Item>
              <List.Item>City: {supplier.city || "Unknown"}</List.Item>
              <List.Item>Contact: {supplier.contactEmail || supplier.contactName || "Not set"}</List.Item>
              <List.Item>Notes: {supplier.notes || "None"}</List.Item>
            </List>
            <InlineStack gap="200">
              <Button onClick={() => updateSupplier(shop, supplier, { leadTimeDays: supplier.leadTimeDays + 1 }, onChanged)}>+1 lead day</Button>
              <Button tone="critical" onClick={() => deleteSupplier(shop, supplier.id, onChanged)}>Delete</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      ))}
      </InlineGrid>
    </BlockStack>
  );
}

function HolidayCalendar() {
  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          China Holiday Risk Windows
        </Text>
        <DataTable
          columnContentTypes={["text", "text", "text", "text"]}
          headings={["Holiday", "Starts", "Ends", "Order before lead time"]}
          rows={sampleHolidays.map((holiday) => [
            holiday.name,
            formatDate(holiday.startsOn),
            formatDate(holiday.endsOn),
            `${holiday.riskLeadTimeDays} days before holiday`,
          ])}
        />
      </BlockStack>
    </Card>
  );
}

function Settings({
  billingState,
  isStartingBilling,
  onStartBilling,
}: {
  billingState: BillingState;
  isStartingBilling: boolean;
  onStartBilling: () => void;
}) {
  return (
    <Layout>
      <Layout.Section>
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Shopify App Store Readiness
            </Text>
            <List>
              <List.Item>Reads Shopify product, inventory, and order data for forecasting only.</List.Item>
              <List.Item>Does not modify store data, write orders, or affect checkout.</List.Item>
              <List.Item>Uses Shopify API data to generate reorder and holiday delay recommendations.</List.Item>
              <List.Item>Does not export customer PII or supplier data to third-party dashboards.</List.Item>
            </List>
          </BlockStack>
        </Card>
      </Layout.Section>
      <Layout.Section variant="oneThird">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Subscription
            </Text>
            <Divider />
            <Text as="p" variant="headingLg">Pro: $29/month</Text>
            <Text as="p" tone="subdued">
              Unlock unlimited SKUs, inventory risk prediction, China holiday delay detection, and weekly alerts.
            </Text>
            <BillingSummary billingState={billingState} />
            <BillingButton
              billingState={billingState}
              loading={isStartingBilling}
              onStartBilling={onStartBilling}
            />
          </BlockStack>
        </Card>
      </Layout.Section>
    </Layout>
  );
}

function ProductsEmptyState({
  loading,
  onSyncProducts,
}: {
  loading: boolean;
  onSyncProducts: () => void;
}) {
  return (
    <Card>
      <EmptyState
        heading="No products synced yet"
        action={{
          content: "Sync Products & Inventory",
          onAction: onSyncProducts,
          loading,
        }}
        image={emptyStateImage}
      >
        <p>Sync your Shopify products and inventory to start mapping them to Chinese suppliers and calculating holiday stockout risk.</p>
      </EmptyState>
    </Card>
  );
}

function ProductsStateBanner({
  productsState,
  loading,
  onSyncProducts,
}: {
  productsState: ProductsState;
  loading: boolean;
  onSyncProducts: () => void;
}) {
  if (productsState.status === "error") {
    return (
      <Banner tone="critical">
        <p>{`Failed to load Shopify products: ${productsState.error}`}</p>
        <div style={{ marginTop: "0.75rem" }}>
          <Button onClick={onSyncProducts} loading={loading}>
            Retry Shopify product sync
          </Button>
        </div>
      </Banner>
    );
  }

  if (productsState.status === "empty") {
    return <ProductsEmptyState loading={loading} onSyncProducts={onSyncProducts} />;
  }

  return null;
}

function RecommendationTable({
  productInsights,
  recommendations,
  products,
  suppliers,
}: {
  productInsights: ProductInsight[];
  recommendations?: Recommendation[];
  products?: VariantSnapshot[];
  suppliers?: Supplier[];
}) {
  if (recommendations?.length && products?.length) {
    const productById = new Map(products.map((product) => [product.id, product]));
    const supplierById = new Map(suppliers?.map((supplier) => [supplier.id, supplier]) || []);

    return (
      <DataTable
        columnContentTypes={["text", "text", "numeric", "numeric", "text", "text", "text"]}
        headings={[
          "Product",
          "Sales velocity",
          "Cover days",
          "Stockout before holiday",
          "Latest reorder date",
          "Risk",
          "Reason",
        ]}
        rows={recommendations.map((item) => {
          const product = productById.get(item.variantSnapshotId);
          const supplier = item.supplierId ? supplierById.get(item.supplierId) : undefined;

          return [
            product ? `${product.productTitle} / ${product.title}` : "Product",
            item.estimatedDailySales === null ? "Needs sales data" : `${item.estimatedDailySales.toFixed(2)} units/day`,
            item.inventoryCoverDays === null ? "Pending" : `${item.inventoryCoverDays} days`,
            item.stockoutDate ? formatDate(item.stockoutDate) : "Pending",
            item.latestReorderDate ? formatDate(item.latestReorderDate) : "Pending",
            <Badge key={item.id} tone={recommendationTone(item.riskLevel)}>
              {item.riskLevel}
            </Badge>,
            supplier ? `${item.reason} (${supplier.name})` : item.reason,
          ];
        })}
      />
    );
  }

  return (
    <DataTable
      columnContentTypes={["text", "text", "numeric", "numeric", "text", "text"]}
      headings={[
        "Product",
        "Supplier",
        "Inventory",
        "Coverage",
        "Latest reorder",
        "Risk",
      ]}
      rows={productInsights.map((item) => [
        `${item.productTitle} / ${item.variantTitle}`,
        item.supplierName || "Needs supplier data",
        item.inventoryQuantity,
        item.inventoryCoverageLabel,
        item.latestReorderLabel,
        <Badge key={item.shopifyVariantId} tone={item.riskTone}>
          {item.riskLabel}
        </Badge>,
      ])}
    />
  );
}

function ProductsMappingTable({
  productInsights,
  snapshots,
  suppliers,
  mappings,
  salesVelocity,
  shop,
  onMapped,
}: {
  productInsights: ProductInsight[];
  snapshots: VariantSnapshot[];
  suppliers: Supplier[];
  mappings: SupplierMapping[];
  salesVelocity: SalesVelocity[];
  shop: string | null;
  onMapped: () => void;
}) {
  const mappingByVariant = new Map(mappings.map((mapping) => [mapping.variantSnapshotId, mapping]));
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const velocityByVariant = new Map(salesVelocity.map((velocity) => [velocity.variantSnapshotId, velocity]));

  if (!snapshots.length) {
    return <RecommendationTable productInsights={productInsights} />;
  }

  return (
    <DataTable
      columnContentTypes={["text", "numeric", "text", "text", "text", "text", "text"]}
      headings={["Product", "Inventory", "Sales velocity", "Supplier", "Lead time", "Buffer", "Status"]}
      rows={snapshots.map((snapshot) => {
        const mapping = snapshot.id ? mappingByVariant.get(snapshot.id) : undefined;
        const supplier = mapping ? supplierById.get(mapping.supplierId) : undefined;
        const velocity = snapshot.id ? velocityByVariant.get(snapshot.id) : undefined;

        return [
          `${snapshot.productTitle} / ${snapshot.title}`,
          snapshot.inventoryQuantity,
          velocity ? `${velocity.estimatedDailySales.toFixed(2)} units/day` : "Needs sales data",
          <Select
            key={snapshot.id || snapshot.shopifyVariantId}
            label="Supplier"
            labelHidden
            value={supplier?.id || ""}
            options={[
              { label: "Needs supplier", value: "" },
              ...suppliers.map((item) => ({ label: item.name, value: item.id })),
            ]}
            onChange={(supplierId) => mapSupplier(shop, snapshot, supplierId, onMapped)}
          />,
          mapping ? `${mapping.factoryLeadTimeDays} days` : "Not set",
          mapping ? `${mapping.reorderBufferDays} days` : "7 days",
          supplier ? <Badge tone="success">Mapped</Badge> : <Badge tone="warning">Needs supplier mapping</Badge>,
        ];
      })}
    />
  );
}

function buildProductInsights(productsState: ProductsState, demoMode: boolean): ProductInsight[] {
  if (productsState.snapshots.length) {
    return productsState.snapshots.map((snapshot) => ({
      shopifyVariantId: snapshot.shopifyVariantId,
      productTitle: snapshot.productTitle,
      variantTitle: snapshot.title,
      sku: snapshot.sku || undefined,
      inventoryQuantity: snapshot.inventoryQuantity,
      inventoryCoverageLabel: "Unknown velocity",
      latestReorderLabel: "Needs sales data",
      riskLabel: "Reorder risk pending",
      riskTone: "info",
    }));
  }

  if (!demoMode) {
    return [];
  }

  return sampleVariants.map((variant) => {
    const recommendation = calculateReorderRecommendation(
      variant,
      sampleAssumptionsByVariant[variant.shopifyVariantId] || {
        supplierName: "Default supplier assumptions",
        productionLeadTimeDays: 30,
        shippingLeadTimeDays: 18,
        bufferDays: 7,
      },
      sampleHolidays,
      today,
    );

    return {
      shopifyVariantId: recommendation.shopifyVariantId,
      productTitle: recommendation.productTitle,
      variantTitle: recommendation.variantTitle,
      sku: recommendation.sku,
      supplierName: recommendation.supplierName,
      inventoryQuantity: recommendation.inventoryQuantity,
      inventoryCoverageLabel:
        recommendation.inventoryCoverageDays === null
          ? "Missing velocity"
          : `${recommendation.inventoryCoverageDays} days`,
      latestReorderLabel: recommendation.latestReorderDate
        ? formatDate(recommendation.latestReorderDate)
        : "Add supplier data",
      riskLabel: recommendation.riskLevel,
      riskTone: riskTone(recommendation.riskLevel),
    };
  });
}

function getDashboardSummary(
  productsState: ProductsState,
  productInsights: ProductInsight[],
  recommendations: Recommendation[],
  salesVelocity: SalesVelocity[],
  ordersSyncResult: OrdersSyncResult | null,
  demoMode: boolean,
) {
  if (!demoMode && !hasLiveOperationalData(productsState, recommendations, salesVelocity, ordersSyncResult)) {
    return {
      totalProducts: "0",
      lowStockProducts: "0",
      criticalRiskCount: "0",
      highRiskCount: "0",
      mediumRiskCount: "0",
      lowRiskCount: "0",
      productsRequiringReorder: "0",
      earliestStockoutDays: "Pending",
      needsSupplierMapping: "0",
      needsSalesVelocity: "0",
      outOfStockProducts: "0",
      reorderRiskPending: "0",
      latestSyncTime: "No sync yet",
      variantsWithVelocity: "0",
      ordersScanned: "Not synced",
      lastVelocitySyncTime: "No order sync yet",
    };
  }

  const snapshots = productsState.snapshots;
  const latestSync = snapshots
    .map((snapshot) => snapshot.syncedAt || snapshot.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];

  const calculatedRecommendations = recommendations.filter(
    (item) => item.estimatedDailySales !== null && item.inventoryCoverDays !== null,
  );
  const reorderRequired = calculatedRecommendations.filter((item) => {
    return (
      item.riskLevel === "critical" ||
      item.riskLevel === "high" ||
      (item.latestReorderDate ? new Date(item.latestReorderDate) <= new Date() : false)
    );
  });
  const earliestStockoutDays = calculatedRecommendations
    .map((item) => item.inventoryCoverDays)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right)[0];

  const averageCoverDays = calculatedRecommendations.length > 0
    ? Math.round(calculatedRecommendations.reduce((sum, item) => sum + (item.inventoryCoverDays || 0), 0) / calculatedRecommendations.length)
    : 0;

  return {
    totalProducts: snapshots.length
      ? snapshots.length.toString()
      : productInsights.length.toString(),
    lowStockProducts: snapshots.filter((snapshot) => snapshot.inventoryQuantity <= 0).length.toString(),
    criticalRiskCount: recommendations.filter((item) => item.riskLevel === "critical" || item.riskLevel === "out_of_stock").length.toString(),
    highRiskCount: recommendations.filter((item) => item.riskLevel === "high").length.toString(),
    mediumRiskCount: recommendations.filter((item) => item.riskLevel === "medium").length.toString(),
    lowRiskCount: recommendations.filter((item) => item.riskLevel === "low").length.toString(),
    productsRequiringReorder: reorderRequired.length.toString(),
    earliestStockoutDays: earliestStockoutDays === undefined ? "Pending" : averageCoverDays.toString(),
    needsSupplierMapping: recommendations.filter((item) => item.reason === "needs_supplier_mapping").length.toString(),
    needsSalesVelocity: recommendations.filter((item) => item.reason === "needs_sales_velocity").length.toString(),
    outOfStockProducts: recommendations.filter((item) => item.reason === "out_of_stock").length.toString(),
    reorderRiskPending: recommendations.filter((item) => item.riskLevel.startsWith("pending")).length.toString(),
    latestSyncTime: latestSync ? formatDateTime(latestSync) : "No sync yet",
    variantsWithVelocity: new Set(salesVelocity.map((item) => item.variantSnapshotId)).size.toString(),
    ordersScanned: ordersSyncResult ? ordersSyncResult.ordersScanned.toString() : "Not synced",
    lastVelocitySyncTime: getLastVelocitySyncTime(salesVelocity, ordersSyncResult),
  };
}

function getDemoReadiness({
  productsState,
  ordersSyncResult,
  salesVelocity,
  recommendations,
  reorderQueue,
  holidayImpact,
}: {
  productsState: ProductsState;
  ordersSyncResult: OrdersSyncResult | null;
  salesVelocity: SalesVelocity[];
  recommendations: Recommendation[];
  reorderQueue: ReorderQueueItem[];
  holidayImpact: ReturnType<typeof getNextHolidayImpact>;
}) {
  return [
    { label: "Products synced", ready: productsState.snapshots.length > 0 },
    { label: "Orders synced", ready: Boolean(ordersSyncResult) || salesVelocity.length > 0 },
    { label: "Sales velocity available", ready: salesVelocity.length > 0 },
    { label: "Recommendations generated", ready: recommendations.length > 0 },
    { label: "Reorder queue available", ready: reorderQueue.length > 0 },
    { label: "China holiday impact available", ready: holidayImpact.name !== "No upcoming holiday" },
  ];
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: BadgeTone;
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <Badge tone={tone}>{label}</Badge>
        <Text as="p" variant="heading2xl">
          {value}
        </Text>
      </BlockStack>
    </Card>
  );
}

function getInventoryDecision(
  productsState: ProductsState,
  summary: ReturnType<typeof getDashboardSummary>,
  recommendations: Recommendation[],
  salesVelocity: SalesVelocity[],
  reorderQueue: ReorderQueueItem[],
  ordersSyncResult: OrdersSyncResult | null,
  demoMode: boolean,
) {
  if (!demoMode) {
    if (!productsState.snapshots.length) {
      return {
        status: "Setup required",
        tone: "info" as const,
        message: "Sync products and inventory to begin forecasting stock risk",
        action: "Sync products and inventory first",
      };
    }

    if (!ordersSyncResult && salesVelocity.length === 0) {
      return {
        status: "Needs order sync",
        tone: "warning" as const,
        message: "Sync Shopify order history to calculate sales velocity and reorder timing",
        action: "Sync order history to generate recommendations",
      };
    }

    if (recommendations.length === 0) {
      return {
        status: "Pending",
        tone: "info" as const,
        message: "Generate recommendations after syncing products, orders, and supplier lead times",
        action: "Map suppliers and refresh recommendations",
      };
    }
  }

  const urgentRecommendation = recommendations.find((item) =>
    item.riskLevel === "critical" || item.riskLevel === "out_of_stock" || item.riskLevel === "high",
  );
  const mediumRecommendation = recommendations.find((item) => item.riskLevel === "medium");
  const actionItem = reorderQueue[0];
  const coverageDays = summary.earliestStockoutDays === "Pending" ? "300" : summary.earliestStockoutDays;

  if (urgentRecommendation || actionItem) {
    const sku = actionItem?.sku || "your highest-risk SKU";
    const days = actionItem?.inventoryCoverDays || urgentRecommendation?.inventoryCoverDays || coverageDays;

    return {
      status: "Critical",
      tone: "critical" as const,
      message: `You have reorder risk within the next ${days} days`,
      action: `Reorder ${sku} in ${days} days`,
    };
  }

  if (mediumRecommendation) {
    const days = mediumRecommendation.inventoryCoverDays || coverageDays;

    return {
      status: "Warning",
      tone: "warning" as const,
      message: `You should review reorder timing within the next ${days} days`,
      action: `Reorder your highest-risk SKU in ${days} days`,
    };
  }

  return {
    status: "Healthy",
    tone: "success" as const,
    message: demoMode
      ? `You are safe for the next ${coverageDays} days`
      : "No high-risk reorder action is currently calculated",
    action: "No action needed now",
  };
}

function getDecisionKpis(
  productsState: ProductsState,
  summary: ReturnType<typeof getDashboardSummary>,
  recommendations: Recommendation[],
  salesVelocity: SalesVelocity[],
  reorderQueue: ReorderQueueItem[],
  ordersSyncResult: OrdersSyncResult | null,
  demoMode: boolean,
) {
  if (!demoMode) {
    if (!productsState.snapshots.length) {
      return [
        { label: "Daily Sales", value: "Pending", tone: "info" as const },
        { label: "Stock Coverage (days)", value: "Pending", tone: "info" as const },
        { label: "Next Reorder Date", value: "Sync products first", tone: "info" as const },
      ];
    }

    if (!ordersSyncResult && salesVelocity.length === 0) {
      return [
        { label: "Daily Sales", value: "Pending", tone: "info" as const },
        { label: "Stock Coverage (days)", value: "Pending", tone: "info" as const },
        { label: "Next Reorder Date", value: "Sync order history", tone: "warning" as const },
      ];
    }

    if (recommendations.length === 0) {
      return [
        {
          label: "Daily Sales",
          value: salesVelocity.length
            ? `${(salesVelocity.reduce((sum, item) => sum + item.estimatedDailySales, 0) / salesVelocity.length).toFixed(1)} units/day`
            : "Pending",
          tone: "info" as const,
        },
        { label: "Stock Coverage (days)", value: "Pending", tone: "info" as const },
        { label: "Next Reorder Date", value: "Generate recommendations", tone: "info" as const },
      ];
    }
  }

  const averageDailySales = salesVelocity.length
    ? salesVelocity.reduce((sum, item) => sum + item.estimatedDailySales, 0) / salesVelocity.length
    : recommendations.reduce((sum, item) => sum + (item.estimatedDailySales || 0), 0) / Math.max(recommendations.length, 1);
  const nextReorderDate = reorderQueue[0]?.recommendedReorderDate
    ? formatDate(reorderQueue[0].recommendedReorderDate)
    : "No reorder needed";

  return [
    {
      label: "Daily Sales",
      value: averageDailySales > 0 ? `${averageDailySales.toFixed(1)} units/day` : "Pending",
      tone: "info" as const,
    },
    {
      label: "Stock Coverage (days)",
      value: summary.earliestStockoutDays === "Pending"
        ? demoMode ? "300" : "Pending"
        : summary.earliestStockoutDays,
      tone: summary.earliestStockoutDays === "Pending"
        ? demoMode ? "success" as const : "info" as const
        : "attention" as const,
    },
    {
      label: "Next Reorder Date",
      value: nextReorderDate,
      tone: reorderQueue.length ? "warning" as const : "success" as const,
    },
  ];
}

function getSkuCards(
  productInsights: ProductInsight[],
  recommendations: Recommendation[],
  products: VariantSnapshot[],
): SkuRiskCard[] {
  const recommendationByVariant = new Map(recommendations.map((item) => [item.variantSnapshotId, item]));
  const productsById = new Map(products.map((product) => [product.id, product]));

  if (recommendations.length) {
    return recommendations.slice(0, 8).map((item) => {
      const product = productsById.get(item.variantSnapshotId);
      const name = product ? `${product.productTitle} / ${product.title}` : "Product";

      return {
        id: item.id,
        productName: name,
        stock: item.currentInventory,
        coverageDays: item.inventoryCoverDays === null ? "Pending" : item.inventoryCoverDays.toString(),
        riskLevel: normalizeRiskLabel(item.riskLevel),
        tone: recommendationTone(item.riskLevel),
      };
    });
  }

  return productInsights.slice(0, 8).map((item) => {
    const recommendation = recommendationByVariant.get(item.shopifyVariantId);

    return {
      id: item.shopifyVariantId,
      productName: `${item.productTitle} / ${item.variantTitle}`,
      stock: item.inventoryQuantity,
      coverageDays: recommendation?.inventoryCoverDays ? recommendation.inventoryCoverDays.toString() : "Pending",
      riskLevel: recommendation ? normalizeRiskLabel(recommendation.riskLevel) : normalizeRiskLabel(item.riskLabel),
      tone: recommendation ? recommendationTone(recommendation.riskLevel) : item.riskTone,
    };
  });
}

function SkuRiskCards({ items }: { items: SkuRiskCard[] }) {
  if (items.length === 0) {
    return (
      <Text as="p" tone="subdued">
        Sync products to start monitoring SKU coverage and reorder risk.
      </Text>
    );
  }

  return (
    <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
      {items.map((item) => (
        <div className="skuRiskCard" key={item.id}>
          <InlineStack align="space-between" blockAlign="start" gap="300">
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm">{item.productName}</Text>
              <Text as="p" tone="subdued">{`Stock: ${item.stock}`}</Text>
            </BlockStack>
            <Badge tone={item.tone}>{item.riskLevel}</Badge>
          </InlineStack>
          <Divider />
          <InlineGrid columns={2} gap="300">
            <SyncResultMetric label="Coverage days" value={item.coverageDays} />
            <SyncResultMetric label="Risk level" value={item.riskLevel} />
          </InlineGrid>
        </div>
      ))}
    </InlineGrid>
  );
}

function normalizeRiskLabel(riskLevel: string) {
  if (riskLevel === "critical" || riskLevel === "out_of_stock" || riskLevel === "high") {
    return "High";
  }

  if (riskLevel === "medium" || riskLevel === "attention") {
    return "Medium";
  }

  return "Low";
}

function getUpcomingStockouts(
  recommendations: Recommendation[],
  products: VariantSnapshot[],
) {
  const productsById = new Map(products.map((product) => [product.id, product]));

  return recommendations
    .filter((item) => item.inventoryCoverDays !== null && item.estimatedDailySales !== null)
    .sort((left, right) => {
      return (left.inventoryCoverDays || Infinity) - (right.inventoryCoverDays || Infinity);
    })
    .slice(0, 10)
    .map((item) => {
      const product = productsById.get(item.variantSnapshotId);

      return {
        sku: product?.sku || "No SKU",
        product: product ? `${product.productTitle} / ${product.title}` : "Product",
        inventory: item.currentInventory,
        estimatedDailySales: item.estimatedDailySales || 0,
        inventoryCoverDays: item.inventoryCoverDays || 0,
        riskLevel: item.riskLevel,
      };
    });
}

function getNextHolidayImpact(todayDate: Date) {
  const nextHoliday = chinaHolidays
    .filter((holiday) => new Date(holiday.endsOn) >= todayDate)
    .sort((left, right) => {
      return new Date(left.startsOn).getTime() - new Date(right.startsOn).getTime();
    })[0];

  if (!nextHoliday) {
    return {
      name: "No upcoming holiday",
      daysRemaining: "N/A",
      orderBeforeDate: "N/A",
    };
  }

  const startsOn = new Date(nextHoliday.startsOn);
  const orderBeforeDate = addDays(startsOn, -nextHoliday.riskLeadTimeDays);
  const daysRemaining = Math.max(0, Math.ceil((startsOn.getTime() - todayDate.getTime()) / dayMs));

  return {
    name: nextHoliday.name,
    daysRemaining: daysRemaining.toString(),
    orderBeforeDate: formatDate(orderBeforeDate.toISOString()),
  };
}

function SyncResultMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <BlockStack gap="100">
      <Text as="p" tone="subdued">
        {label}
      </Text>
      <Text as="p" variant="headingLg">
        {value}
      </Text>
    </BlockStack>
  );
}

function UpcomingStockoutTable({ items }: { items: UpcomingStockoutItem[] }) {
  if (items.length === 0) {
    return (
      <Text as="p" tone="subdued">
        No calculated stockout risks yet. Sync orders and generate recommendations to populate this table.
      </Text>
    );
  }

  return (
    <DataTable
      columnContentTypes={["text", "text", "numeric", "numeric", "numeric", "text"]}
      headings={["SKU", "Product", "Inventory", "Daily sales", "Cover days", "Risk"]}
      rows={items.map((item) => [
        item.sku,
        item.product,
        item.inventory,
        item.estimatedDailySales.toFixed(2),
        item.inventoryCoverDays,
        <Badge key={item.sku} tone={recommendationTone(item.riskLevel)}>
          {item.riskLevel}
        </Badge>,
      ])}
    />
  );
}

function ReorderQueueTable({
  items,
  hasSalesVelocity,
}: {
  items: ReorderQueueItem[];
  hasSalesVelocity: boolean;
}) {
  if (items.length === 0) {
    return (
      <Text as="p" tone="subdued">
        {hasSalesVelocity
          ? "No reorder queue items currently require action."
          : "No reorder queue yet. Sync order history to calculate sales velocity first."}
      </Text>
    );
  }

  return (
    <DataTable
      columnContentTypes={["text", "text", "numeric", "numeric", "numeric", "text", "text"]}
      headings={["SKU", "Product", "Inventory", "Daily sales", "Cover days", "Reorder by", "Risk"]}
      rows={items.map((item) => [
        item.sku || "No SKU",
        `${item.productTitle} / ${item.variantTitle}`,
        item.inventory,
        item.estimatedDailySales.toFixed(2),
        item.inventoryCoverDays,
        formatDate(item.recommendedReorderDate),
        <Badge key={`${item.productTitle}-${item.variantTitle}`} tone={recommendationTone(item.riskLevel)}>
          {item.riskLevel}
        </Badge>,
      ])}
    />
  );
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * dayMs);
}

function riskTone(riskLevel: RiskLevel) {
  if (riskLevel === "critical") {
    return "critical";
  }

  if (riskLevel === "high") {
    return "warning";
  }

  if (riskLevel === "medium") {
    return "attention";
  }

  return "success";
}

function recommendationTone(riskLevel: string) {
  if (riskLevel === "out_of_stock" || riskLevel === "critical") {
    return "critical";
  }

  if (riskLevel === "high") {
    return "warning";
  }

  if (riskLevel === "medium") {
    return "attention";
  }

  if (riskLevel.startsWith("pending")) {
    return "info";
  }

  return "success";
}

function getLastVelocitySyncTime(
  salesVelocity: SalesVelocity[],
  ordersSyncResult: OrdersSyncResult | null,
) {
  const latestVelocity = salesVelocity
    .map((item) => item.calculatedTo || item.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
  const latest = ordersSyncResult?.calculatedTo || latestVelocity;

  return latest ? formatDateTime(latest) : "No order sync yet";
}

function hasLiveOperationalData(
  productsState: ProductsState,
  recommendations: Recommendation[],
  salesVelocity: SalesVelocity[],
  ordersSyncResult: OrdersSyncResult | null,
) {
  return (
    productsState.snapshots.length > 0 ||
    recommendations.length > 0 ||
    salesVelocity.length > 0 ||
    ordersSyncResult !== null
  );
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(date));
}

async function fetchJson<TData = unknown>(url: string, init?: RequestInit): Promise<TData> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  const sessionToken = await getShopifySessionToken(url);

  if (sessionToken) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      console.warn("[Shopify API auth failure]", {
        url,
        status: response.status,
        hasAuthorizationHeader: headers.has("Authorization"),
        host: getHostFromUrl(),
        shop: getShopFromUrl(),
      });
    }

    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<TData>;
}

async function getShopifySessionToken(requestUrl: string): Promise<string | null> {
  if (typeof window === "undefined" || getDemoModeFromUrl()) {
    return null;
  }

  const host = getHostFromUrl();
  const shop = getShopFromUrl();

  if (!host) {
    console.warn("[Shopify session token] host parameter missing", { requestUrl, shop });
    return null;
  }

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const idToken = window.shopify?.idToken;

    if (!idToken) {
      console.info("[Shopify session token] idToken unavailable, waiting", {
        requestUrl,
        attempt,
        host,
        shop,
        hasShopifyGlobal: Boolean(window.shopify),
      });
      await wait(150 * attempt);
      continue;
    }

    try {
      const token = await idToken();
      console.info("[Shopify session token] retrieved", {
        requestUrl,
        host,
        shop,
        tokenLength: token.length,
      });
      return token;
    } catch (error) {
      console.warn("[Shopify session token] retrieval failed", {
        requestUrl,
        attempt,
        host,
        shop,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      await wait(150 * attempt);
    }
  }

  console.warn("[Shopify session token] unavailable after retries", {
    requestUrl,
    host,
    shop,
    hasShopifyGlobal: Boolean(window.shopify),
    hasIdToken: Boolean(window.shopify?.idToken),
  });

  return null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();

  try {
    const payload = JSON.parse(text) as { message?: string };
    return payload.message || text;
  } catch {
    return text;
  }
}

async function updateSupplier(
  shop: string | null,
  supplier: Supplier,
  input: Partial<Supplier>,
  onChanged: () => void,
) {
  if (!shop) {
    return;
  }

  await fetchJson(`/api/suppliers/${encodeURIComponent(supplier.id)}?shop=${encodeURIComponent(shop)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  onChanged();
}

async function deleteSupplier(shop: string | null, supplierId: string, onChanged: () => void) {
  if (!shop) {
    return;
  }

  await fetchJson(`/api/suppliers/${encodeURIComponent(supplierId)}?shop=${encodeURIComponent(shop)}`, {
    method: "DELETE",
  });
  onChanged();
}

async function mapSupplier(
  shop: string | null,
  snapshot: VariantSnapshot,
  supplierId: string,
  onMapped: () => void,
) {
  if (!shop || !snapshot.id || !supplierId) {
    return;
  }

  await fetchJson(`/api/supplier-mappings?shop=${encodeURIComponent(shop)}`, {
    method: "POST",
    body: JSON.stringify({
      variantSnapshotId: snapshot.id,
      supplierId,
    }),
  });
  await fetchJson(`/api/recommendations/generate?shop=${encodeURIComponent(shop)}`, {
    method: "POST",
  });
  onMapped();
}
