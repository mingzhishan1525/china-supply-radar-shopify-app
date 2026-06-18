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
  Link,
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
import { PRODUCTS_QUERY } from "../shopify/queries";

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
  const [isSyncingOrders, setIsSyncingOrders] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const shop = getShopFromUrl();
  const host = getHostFromUrl();
  const demoMode = getDemoModeFromUrl();

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

        setProductsState({
          status: payload.products.length ? "success" : "empty",
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

  const productInsights = useMemo(
    () => buildProductInsights(productsState),
    [productsState],
  );

  // Show loading if host is missing (not in embedded context)
  if (!host && !demoMode) {
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
      secondaryActions={[<Button>Sync Products & Inventory</Button>]}
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
            demoMode={demoMode}
            dataError={dataError}
            onSyncOrders={syncOrders}
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
          />
        ) : null}
        {selectedTab === 4 ? <HolidayCalendar /> : null}
        {selectedTab === 5 ? <Settings /> : null}
      </Box>
    </Page>
  );

  return (
    <AppProvider i18n={enTranslations}>
      {appContent}
    </AppProvider>
  );
}

// Rest of the components remain unchanged
function Overview({
  productInsights,
  productsState,
  suppliers,
  recommendations,
  salesVelocity,
  reorderQueue,
  ordersSyncResult,
  isSyncingOrders,
  demoMode,
  dataError,
  onSyncOrders,
}: {
  productInsights: ProductInsight[];
  productsState: ProductsState;
  suppliers: Supplier[];
  recommendations: Recommendation[];
  salesVelocity: SalesVelocity[];
  reorderQueue: ReorderQueueItem[];
  ordersSyncResult: OrdersSyncResult | null;
  isSyncingOrders: boolean;
  demoMode: boolean;
  dataError: string | null;
  onSyncOrders: () => void;
}) {
  const summary = getDashboardSummary(productsState, productInsights, recommendations, salesVelocity, ordersSyncResult);
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

  const hasData = salesVelocity.length > 0 && suppliers.length > 0 && recommendations.length > 0;

  if (!hasData) {
    return (
      <Layout>
        <Layout.Section>
          <Card>
            <EmptyState
              heading="No China supply chain risk data yet"
              action={{
                content: "Sync Orders & Map Suppliers",
                onAction: onSyncOrders,
              }}
              image="https://cdn.shopify.com/s/files/1/0759/7459/3952/files/empty-state-supply-chain.png"
            >
              <p>Sync your Shopify orders and map products to Chinese suppliers to calculate holiday stockout risk and recommended reorder dates.</p>
            </EmptyState>
          </Card>
        </Layout.Section>
      </Layout>
    );
  }

  return (
    <Layout>
      <Layout.Section>
        <ProductsStateBanner productsState={productsState} />
      </Layout.Section>
      {dataError && (
        <Layout.Section>
          <Banner tone="critical">
            <p>{dataError}</p>
          </Banner>
        </Layout.Section>
      )}
      <Layout.Section>
        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="headingSm" tone="subdued">Upcoming China Holiday</Text>
              <Text as="p" variant="heading2xl" tone="caution">{holidayImpact.name}</Text>
              <Badge tone="attention">{`${holidayImpact.daysRemaining} days remaining`}</Badge>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="headingSm" tone="subdued">Factory Slowdown Risk</Text>
              <Text as="p" variant="heading2xl" tone="critical">{`${summary.criticalRiskCount} products`}</Text>
              <Badge tone="warning">{`Order before ${holidayImpact.orderBeforeDate}`}</Badge>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="headingSm" tone="subdued">Average Inventory Cover Days</Text>
              <Text as="p" variant="heading2xl">{`${summary.earliestStockoutDays} days`}</Text>
              <Badge tone="success">{`${summary.productsRequiringReorder} need reorder`}</Badge>
            </BlockStack>
          </Card>
        </InlineGrid>
      </Layout.Section>
      <Layout.Section>
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Sales & Order Sync Status</Text>
                <Text as="p" tone="subdued">
                  Orders scanned: {summary.ordersScanned}. Last velocity sync: {summary.lastVelocitySyncTime}.
                </Text>
              </BlockStack>
              <Button onClick={onSyncOrders} loading={isSyncingOrders}>
                Sync Order History
              </Button>
            </InlineStack>
            {ordersSyncResult && !demoMode ? (
              <InlineGrid columns={{ xs: 1, md: 4 }} gap="300">
                <SyncResultMetric label="Line items scanned" value={ordersSyncResult.lineItemsScanned.toString()} />
                <SyncResultMetric label="Variants updated" value={ordersSyncResult.variantsUpdated.toString()} />
                <SyncResultMetric label="Unmatched items" value={ordersSyncResult.unmatchedLineItems.toString()} />
                <SyncResultMetric label="Window days" value={ordersSyncResult.windowDays.toString()} />
              </InlineGrid>
            ) : null}
            {salesVelocity.length === 0 ? (
              <Text as="p" tone="subdued">
                No sales velocity yet. Create a test order and sync orders to calculate inventory risk.
              </Text>
            ) : null}
          </BlockStack>
        </Card>
      </Layout.Section>
      <Layout.Section>
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">China Holiday Risk Alerts</Text>
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
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                Upcoming Stockouts Before Holiday
              </Text>
              <Text as="p" tone="subdued">Top 10 SKUs by cover days</Text>
            </InlineStack>
            <UpcomingStockoutTable items={upcomingStockouts} />
          </BlockStack>
        </Card>
      </Layout.Section>
      <Layout.Section>
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">Reorder Queue for China Suppliers</Text>
              <Text as="p" tone="subdued">Calculated from real velocity</Text>
            </InlineStack>
            <ReorderQueueTable items={reorderQueue} hasSalesVelocity={salesVelocity.length > 0} />
          </BlockStack>
        </Card>
      </Layout.Section>
    </Layout>
  );
}

function Orders({
  ordersSyncResult,
  salesVelocity,
  isSyncingOrders,
  onSyncOrders,
}: {
  ordersSyncResult: OrdersSyncResult | null;
  salesVelocity: SalesVelocity[];
  isSyncingOrders: boolean;
  onSyncOrders: () => void;
}) {
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
            <SyncResultMetric label="Line items scanned" value={ordersSyncResult.lineItemsScanned.toString()} />
            <SyncResultMetric label="Variants updated" value={ordersSyncResult.variantsUpdated.toString()} />
            <SyncResultMetric label="Window days" value={ordersSyncResult.windowDays.toString()} />
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
              const product = sampleVariants.find(v => v.shopifyVariantId === velocity.shopifyVariantId);
              return [
                product ? `${product.productTitle} / ${product.variantTitle}` : velocity.shopifyVariantId,
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
}: {
  recommendations: Recommendation[];
  reorderQueue: ReorderQueueItem[];
  products: VariantSnapshot[];
  suppliers: Supplier[];
  productInsights: ProductInsight[];
}) {
  if (recommendations.length === 0) {
    return (
      <Card>
        <EmptyState
          heading="No reorder recommendations yet"
          action={{
            content: "Sync Orders & Map Suppliers",
            onAction: () => window.location.reload(),
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

  if (suppliers.length === 0) {
    return (
      <Card>
        <EmptyState
          heading="No suppliers added yet"
          action={{
            content: "Add China Supplier",
            onAction: () => {},
          }}
          image={emptyStateImage}
        >
          <p>Add your Chinese suppliers and their lead times to start tracking factory slowdown and holiday risks for your products.</p>
        </EmptyState>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Add China Supplier</Text>
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

function Settings() {
  return (
    <Layout>
      <Layout.Section>
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Shopify Integration
            </Text>
            <List>
              <List.Item>Embedded app target: Shopify Admin</List.Item>
              <List.Item>Initial scopes: read_products, read_inventory, read_orders</List.Item>
              <List.Item>Chrome extension: optional companion workflow only</List.Item>
            </List>
          </BlockStack>
        </Card>
      </Layout.Section>
      <Layout.Section variant="oneThird">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              GraphQL Query Stub
            </Text>
            <Divider />
            <pre className="queryPreview">{PRODUCTS_QUERY}</pre>
            <Link url="https://shopify.dev/docs/api/admin-graphql" target="_blank">
              Shopify Admin GraphQL docs
            </Link>
          </BlockStack>
        </Card>
      </Layout.Section>
    </Layout>
  );
}

function ProductsEmptyState() {
  return (
    <Card>
      <EmptyState
        heading="No products synced yet"
        action={{
          content: "Sync Products & Inventory",
          onAction: () => window.location.reload(),
        }}
        image={emptyStateImage}
      >
        <p>Sync your Shopify products and inventory to start mapping them to Chinese suppliers and calculating holiday stockout risk.</p>
      </EmptyState>
    </Card>
  );
}

function ProductsStateBanner({ productsState }: { productsState: ProductsState }) {
  if (productsState.status === "error") {
    return (
      <Banner tone="critical">
        <p>Failed to load products: {productsState.error}</p>
      </Banner>
    );
  }

  if (productsState.status === "empty") {
    return <ProductsEmptyState />;
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
            product ? `${product.productTitle} / ${product.title}` : item.variantSnapshotId,
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

function buildProductInsights(productsState: ProductsState): ProductInsight[] {
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
) {
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
  tone: "attention" | "critical" | "info" | "success" | "warning";
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
        product: product ? `${product.productTitle} / ${product.title}` : item.variantSnapshotId,
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

  const sessionToken = await getShopifySessionToken();

  if (sessionToken) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<TData>;
}

async function getShopifySessionToken(): Promise<string | null> {
  if (typeof window === "undefined" || !window.shopify?.idToken) {
    return null;
  }

  try {
    return await window.shopify.idToken();
  } catch {
    return null;
  }
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
