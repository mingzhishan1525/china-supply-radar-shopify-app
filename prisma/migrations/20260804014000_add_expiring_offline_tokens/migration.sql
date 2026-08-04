ALTER TABLE "ShopSession" ADD COLUMN "refreshTokenEncrypted" TEXT;
ALTER TABLE "ShopSession" ADD COLUMN "accessTokenExpiresAt" DATETIME;
ALTER TABLE "ShopSession" ADD COLUMN "refreshTokenExpiresAt" DATETIME;
