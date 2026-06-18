/*
  Warnings:

  - You are about to drop the column `calculatedAt` on the `SalesVelocity` table. All the data in the column will be lost.
  - You are about to drop the column `lookbackDays` on the `SalesVelocity` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `SalesVelocity` table. All the data in the column will be lost.
  - Added the required column `calculatedFrom` to the `SalesVelocity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `calculatedTo` to the `SalesVelocity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopifyVariantId` to the `SalesVelocity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitsSold` to the `SalesVelocity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `SalesVelocity` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SalesVelocity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "variantSnapshotId" TEXT NOT NULL,
    "unitsSold" INTEGER NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 30,
    "estimatedDailySales" REAL NOT NULL,
    "calculatedFrom" DATETIME NOT NULL,
    "calculatedTo" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SalesVelocity" ("estimatedDailySales", "id", "shop", "variantSnapshotId") SELECT "estimatedDailySales", "id", "shop", "variantSnapshotId" FROM "SalesVelocity";
DROP TABLE "SalesVelocity";
ALTER TABLE "new_SalesVelocity" RENAME TO "SalesVelocity";
CREATE INDEX "SalesVelocity_shop_idx" ON "SalesVelocity"("shop");
CREATE INDEX "SalesVelocity_shop_variantSnapshotId_idx" ON "SalesVelocity"("shop", "variantSnapshotId");
CREATE UNIQUE INDEX "SalesVelocity_shop_shopifyVariantId_windowDays_key" ON "SalesVelocity"("shop", "shopifyVariantId", "windowDays");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
