-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT,
    "scopes" TEXT NOT NULL,
    "email" TEXT,
    "timezone" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" DATETIME
);

-- CreateTable
CREATE TABLE "ShopSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "isInstalled" BOOLEAN NOT NULL DEFAULT true,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VariantSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "price" TEXT,
    "inventoryQuantity" INTEGER NOT NULL,
    "shopifyUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'China',
    "province" TEXT,
    "city" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactUrl" TEXT,
    "defaultProductionLeadTimeDays" INTEGER NOT NULL DEFAULT 30,
    "defaultShippingLeadTimeDays" INTEGER NOT NULL DEFAULT 18,
    "defaultBufferDays" INTEGER NOT NULL DEFAULT 7,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Supplier_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductVariantSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "inventoryQuantity" INTEGER NOT NULL,
    "price" TEXT,
    "shopifyUpdatedAt" DATETIME,
    "locationId" TEXT,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductVariantSnapshot_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierVariantMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "supplierSku" TEXT,
    "moq" INTEGER,
    "productionLeadTimeDaysOverride" INTEGER,
    "shippingLeadTimeDaysOverride" INTEGER,
    "bufferDaysOverride" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupplierVariantMapping_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierVariantMapping_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesVelocity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "unitsPerDay" REAL NOT NULL,
    "lookbackDays" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesVelocity_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HolidayWindow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'China',
    "startsOn" DATETIME NOT NULL,
    "endsOn" DATETIME NOT NULL,
    "riskLeadTimeDays" INTEGER NOT NULL DEFAULT 45,
    "severity" TEXT NOT NULL,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "ReorderRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "supplierId" TEXT,
    "inventoryQuantity" INTEGER NOT NULL,
    "unitsPerDay" REAL NOT NULL,
    "estimatedStockoutDate" DATETIME,
    "latestReorderDate" DATETIME,
    "totalLeadTimeDays" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "riskReasonsJson" TEXT NOT NULL,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReorderRecommendation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReorderRecommendation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSession_shop_key" ON "ShopSession"("shop");

-- CreateIndex
CREATE INDEX "VariantSnapshot_shop_idx" ON "VariantSnapshot"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "VariantSnapshot_shop_shopifyVariantId_key" ON "VariantSnapshot"("shop", "shopifyVariantId");

-- CreateIndex
CREATE INDEX "ProductVariantSnapshot_shopId_shopifyVariantId_idx" ON "ProductVariantSnapshot"("shopId", "shopifyVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierVariantMapping_shopId_shopifyVariantId_key" ON "SupplierVariantMapping"("shopId", "shopifyVariantId");

-- CreateIndex
CREATE INDEX "SalesVelocity_shopId_shopifyVariantId_idx" ON "SalesVelocity"("shopId", "shopifyVariantId");

-- CreateIndex
CREATE INDEX "ReorderRecommendation_shopId_shopifyVariantId_idx" ON "ReorderRecommendation"("shopId", "shopifyVariantId");
