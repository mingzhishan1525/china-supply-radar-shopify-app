/*
  Warnings:

  - You are about to drop the `ProductVariantSnapshot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ReorderRecommendation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SupplierVariantMapping` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `shopId` on the `SalesVelocity` table. All the data in the column will be lost.
  - You are about to drop the column `shopifyVariantId` on the `SalesVelocity` table. All the data in the column will be lost.
  - You are about to drop the column `unitsPerDay` on the `SalesVelocity` table. All the data in the column will be lost.
  - You are about to drop the column `contactUrl` on the `Supplier` table. All the data in the column will be lost.
  - You are about to drop the column `defaultBufferDays` on the `Supplier` table. All the data in the column will be lost.
  - You are about to drop the column `defaultProductionLeadTimeDays` on the `Supplier` table. All the data in the column will be lost.
  - You are about to drop the column `defaultShippingLeadTimeDays` on the `Supplier` table. All the data in the column will be lost.
  - You are about to drop the column `shopId` on the `Supplier` table. All the data in the column will be lost.
  - Added the required column `estimatedDailySales` to the `SalesVelocity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shop` to the `SalesVelocity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `variantSnapshotId` to the `SalesVelocity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shop` to the `Supplier` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ProductVariantSnapshot_shopId_shopifyVariantId_idx";

-- DropIndex
DROP INDEX "ReorderRecommendation_shopId_shopifyVariantId_idx";

-- DropIndex
DROP INDEX "SupplierVariantMapping_shopId_shopifyVariantId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProductVariantSnapshot";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ReorderRecommendation";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "SupplierVariantMapping";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "SupplierMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "variantSnapshotId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierSku" TEXT,
    "factoryLeadTimeDays" INTEGER NOT NULL,
    "reorderBufferDays" INTEGER NOT NULL DEFAULT 7,
    "moq" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "variantSnapshotId" TEXT NOT NULL,
    "supplierId" TEXT,
    "currentInventory" INTEGER NOT NULL,
    "estimatedDailySales" REAL,
    "inventoryCoverDays" INTEGER,
    "stockoutDate" DATETIME,
    "latestReorderDate" DATETIME,
    "riskLevel" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SalesVelocity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "variantSnapshotId" TEXT NOT NULL,
    "estimatedDailySales" REAL NOT NULL,
    "lookbackDays" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_SalesVelocity" ("calculatedAt", "id", "lookbackDays", "source") SELECT "calculatedAt", "id", "lookbackDays", "source" FROM "SalesVelocity";
DROP TABLE "SalesVelocity";
ALTER TABLE "new_SalesVelocity" RENAME TO "SalesVelocity";
CREATE INDEX "SalesVelocity_shop_idx" ON "SalesVelocity"("shop");
CREATE UNIQUE INDEX "SalesVelocity_shop_variantSnapshotId_key" ON "SalesVelocity"("shop", "variantSnapshotId");
CREATE TABLE "new_Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'China',
    "province" TEXT,
    "city" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "wechat" TEXT,
    "whatsapp" TEXT,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 14,
    "moq" INTEGER,
    "notes" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'unknown',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Supplier" ("city", "contactEmail", "contactName", "country", "createdAt", "id", "name", "notes", "province", "updatedAt") SELECT "city", "contactEmail", "contactName", "country", "createdAt", "id", "name", "notes", "province", "updatedAt" FROM "Supplier";
DROP TABLE "Supplier";
ALTER TABLE "new_Supplier" RENAME TO "Supplier";
CREATE INDEX "Supplier_shop_isActive_idx" ON "Supplier"("shop", "isActive");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SupplierMapping_shop_supplierId_idx" ON "SupplierMapping"("shop", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierMapping_shop_variantSnapshotId_key" ON "SupplierMapping"("shop", "variantSnapshotId");

-- CreateIndex
CREATE INDEX "Recommendation_shop_riskLevel_idx" ON "Recommendation"("shop", "riskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_shop_variantSnapshotId_key" ON "Recommendation"("shop", "variantSnapshotId");
