import { encryptSecret } from "../security/encryption.ts";
import { getAppConfig } from "./config.ts";

const config = getAppConfig();
const shop = process.env.SEED_SHOP || "demo-store.myshopify.com";
const accessToken = process.env.SEED_ACCESS_TOKEN || "shpat_mock_token";

try {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  await prisma.shopSession.upsert({
    where: { shop },
    create: {
      shop,
      accessTokenEncrypted: encryptSecret(accessToken, config.encryptionSecret),
      scope: config.scopes.join(","),
      isInstalled: true,
      installedAt: new Date(),
    },
    update: {
      accessTokenEncrypted: encryptSecret(accessToken, config.encryptionSecret),
      scope: config.scopes.join(","),
      isInstalled: true,
      uninstalledAt: null,
    },
  });

  await prisma.$disconnect();
  console.log(`Seeded mock ShopSession for ${shop}`);
} catch (error) {
  console.error("Unable to seed database. Run prisma generate first.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
