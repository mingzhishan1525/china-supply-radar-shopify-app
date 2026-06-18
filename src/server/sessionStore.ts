import { decryptSecret, encryptSecret } from "../security/encryption.ts";

export type ShopSession = {
  id?: string;
  shop: string;
  accessToken: string;
  scope: string;
  isInstalled: boolean;
  installedAt: string;
  uninstalledAt: string | null;
  updatedAt: string;
};

export type SaveShopSessionInput = {
  shop: string;
  accessToken: string;
  scope: string;
  installedAt?: string;
};

export interface SessionStore {
  save(session: SaveShopSessionInput): Promise<ShopSession>;
  load(shop: string): Promise<ShopSession | null>;
  delete(shop: string): Promise<void>;
  deleteShopSessions(shop: string): Promise<void>;
  markUninstalled(shop: string, uninstalledAt?: string): Promise<void>;
}

type StoredShopSession = {
  id?: string;
  shop: string;
  accessTokenEncrypted: string;
  scope: string;
  isInstalled: boolean;
  installedAt: Date | string;
  uninstalledAt: Date | string | null;
  updatedAt: Date | string;
};

export type PrismaSessionClient = {
  shopSession: {
    upsert(args: {
      where: { shop: string };
      create: {
        shop: string;
        accessTokenEncrypted: string;
        scope: string;
        isInstalled: boolean;
        installedAt: Date;
      };
      update: {
        accessTokenEncrypted: string;
        scope: string;
        isInstalled: boolean;
        uninstalledAt: null;
      };
    }): Promise<StoredShopSession>;
    findUnique(args: { where: { shop: string } }): Promise<StoredShopSession | null>;
    delete(args: { where: { shop: string } }): Promise<StoredShopSession>;
    deleteMany(args: { where: { shop: string } }): Promise<{ count: number }>;
    update(args: {
      where: { shop: string };
      data: { isInstalled: boolean; uninstalledAt: Date };
    }): Promise<StoredShopSession>;
  };
};

export class PrismaSessionStore implements SessionStore {
  private readonly prisma: PrismaSessionClient;
  private readonly encryptionSecret: string;

  constructor(
    prisma: PrismaSessionClient,
    encryptionSecret: string,
  ) {
    this.prisma = prisma;
    this.encryptionSecret = encryptionSecret;
  }

  async save(session: SaveShopSessionInput): Promise<ShopSession> {
    const installedAt = session.installedAt
      ? new Date(session.installedAt)
      : new Date();
    const stored = await this.prisma.shopSession.upsert({
      where: { shop: session.shop },
      create: {
        shop: session.shop,
        accessTokenEncrypted: encryptSecret(session.accessToken, this.encryptionSecret),
        scope: session.scope,
        isInstalled: true,
        installedAt,
      },
      update: {
        accessTokenEncrypted: encryptSecret(session.accessToken, this.encryptionSecret),
        scope: session.scope,
        isInstalled: true,
        uninstalledAt: null,
      },
    });

    return this.toPlainSession(stored);
  }

  async load(shop: string): Promise<ShopSession | null> {
    const stored = await this.prisma.shopSession.findUnique({
      where: { shop },
    });

    return stored ? this.toPlainSession(stored) : null;
  }

  async delete(shop: string): Promise<void> {
    await this.prisma.shopSession.delete({
      where: { shop },
    });
  }

  async deleteShopSessions(shop: string): Promise<void> {
    await this.prisma.shopSession.deleteMany({
      where: { shop },
    });
  }

  async markUninstalled(shop: string, uninstalledAt = new Date().toISOString()): Promise<void> {
    await this.prisma.shopSession.update({
      where: { shop },
      data: {
        isInstalled: false,
        uninstalledAt: new Date(uninstalledAt),
      },
    });
  }

  private toPlainSession(stored: StoredShopSession): ShopSession {
    return {
      id: stored.id,
      shop: stored.shop,
      accessToken: decryptSecret(stored.accessTokenEncrypted, this.encryptionSecret),
      scope: stored.scope,
      isInstalled: stored.isInstalled,
      installedAt: toIsoString(stored.installedAt),
      uninstalledAt: stored.uninstalledAt ? toIsoString(stored.uninstalledAt) : null,
      updatedAt: toIsoString(stored.updatedAt),
    };
  }
}

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, StoredShopSession>();
  private readonly encryptionSecret: string;

  constructor(encryptionSecret = "test-memory-session-secret") {
    this.encryptionSecret = encryptionSecret;
  }

  async save(session: SaveShopSessionInput): Promise<ShopSession> {
    const now = new Date().toISOString();
    const previous = this.sessions.get(session.shop);
    const stored: StoredShopSession = {
      id: previous?.id || `memory_${this.sessions.size + 1}`,
      shop: session.shop,
      accessTokenEncrypted: encryptSecret(session.accessToken, this.encryptionSecret),
      scope: session.scope,
      isInstalled: true,
      installedAt: session.installedAt || previous?.installedAt || now,
      uninstalledAt: null,
      updatedAt: now,
    };

    this.sessions.set(session.shop, stored);
    return this.toPlainSession(stored);
  }

  async load(shop: string): Promise<ShopSession | null> {
    const stored = this.sessions.get(shop);

    return stored ? this.toPlainSession(stored) : null;
  }

  async delete(shop: string): Promise<void> {
    this.sessions.delete(shop);
  }

  async deleteShopSessions(shop: string): Promise<void> {
    this.sessions.delete(shop);
  }

  async markUninstalled(shop: string, uninstalledAt = new Date().toISOString()): Promise<void> {
    const stored = this.sessions.get(shop);

    if (!stored) {
      return;
    }

    this.sessions.set(shop, {
      ...stored,
      isInstalled: false,
      uninstalledAt,
      updatedAt: new Date().toISOString(),
    });
  }

  async getStoredForTest(shop: string): Promise<StoredShopSession | null> {
    return this.sessions.get(shop) || null;
  }

  private toPlainSession(stored: StoredShopSession): ShopSession {
    return {
      id: stored.id,
      shop: stored.shop,
      accessToken: decryptSecret(stored.accessTokenEncrypted, this.encryptionSecret),
      scope: stored.scope,
      isInstalled: stored.isInstalled,
      installedAt: toIsoString(stored.installedAt),
      uninstalledAt: stored.uninstalledAt ? toIsoString(stored.uninstalledAt) : null,
      updatedAt: toIsoString(stored.updatedAt),
    };
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
