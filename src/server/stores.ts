import type { AppConfig } from "./config.ts";
import { PrismaSessionStore, MemorySessionStore } from "./sessionStore.ts";
import { MemoryVariantSnapshotStore } from "./variantSnapshotStore.ts";
import { MemorySupplyChainStore } from "./memorySupplyChainStore.ts";

export async function createStores(config: AppConfig) {
  if (process.env.SESSION_STORE === "memory") {
    const variantStore = new MemoryVariantSnapshotStore();
    const supplyChainStore = new MemorySupplyChainStore();

    return {
      sessionStore: new MemorySessionStore(config.encryptionSecret),
      variantStore,
      supplyChainStore,
    };
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  return {
    sessionStore: new PrismaSessionStore(prisma, config.encryptionSecret),
    variantStore: prisma,
    supplyChainStore: prisma,
  };
}
