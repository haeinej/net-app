import { desc, eq, sql } from "drizzle-orm";
import { db, rankingConfigs } from "../db";
import {
  feedConfig,
  mergeFeedConfig,
  normalizeFeedConfig,
  validateFeedConfigPatch,
  type FeedConfigPatch,
  type FeedRuntimeConfig,
} from "./config";

const CONFIG_CACHE_TTL_MS = 60 * 1000;

type RankingConfigRow = typeof rankingConfigs.$inferSelect;

export type RankingConfigSnapshot = {
  id: string | null;
  version: string;
  name: string;
  notes: string | null;
  is_active: boolean;
  source: "default" | "database";
  config: FeedRuntimeConfig;
  created_at: string | null;
  updated_at: string | null;
  activated_at: string | null;
};

let activeConfigCache:
  | { snapshot: RankingConfigSnapshot; expiresAt: number }
  | null = null;
const versionConfigCache = new Map<
  string,
  { snapshot: RankingConfigSnapshot; expiresAt: number }
>();

function toSnapshot(row: RankingConfigRow): RankingConfigSnapshot {
  const config = normalizeFeedConfig(row.config, row.version);
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    notes: row.notes ?? null,
    is_active: row.isActive,
    source: "database",
    config,
    created_at: row.createdAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
    activated_at: row.activatedAt?.toISOString() ?? null,
  };
}

function defaultSnapshot(): RankingConfigSnapshot {
  return {
    id: null,
    version: feedConfig.version,
    name: "Default feed config",
    notes: "Built-in fallback config",
    is_active: true,
    source: "default",
    config: normalizeFeedConfig(feedConfig),
    created_at: null,
    updated_at: null,
    activated_at: null,
  };
}

function setVersionCache(snapshot: RankingConfigSnapshot) {
  versionConfigCache.set(snapshot.version, {
    snapshot,
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
  });
}

export function invalidateRankingConfigCache(version?: string): void {
  activeConfigCache = null;
  if (version) {
    versionConfigCache.delete(version);
    return;
  }
  versionConfigCache.clear();
}

export async function getActiveRankingConfig(): Promise<RankingConfigSnapshot> {
  const now = Date.now();
  if (activeConfigCache && activeConfigCache.expiresAt > now) {
    return activeConfigCache.snapshot;
  }

  const [row] = await db
    .select()
    .from(rankingConfigs)
    .where(eq(rankingConfigs.isActive, true))
    .orderBy(desc(rankingConfigs.activatedAt), desc(rankingConfigs.updatedAt))
    .limit(1);

  const snapshot = row ? toSnapshot(row) : defaultSnapshot();
  activeConfigCache = {
    snapshot,
    expiresAt: now + CONFIG_CACHE_TTL_MS,
  };
  setVersionCache(snapshot);
  return snapshot;
}

export async function getRankingConfigByVersion(
  version: string
): Promise<RankingConfigSnapshot | null> {
  const cached = versionConfigCache.get(version);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.snapshot;
  }

  const [row] = await db
    .select()
    .from(rankingConfigs)
    .where(eq(rankingConfigs.version, version))
    .limit(1);
  if (!row) {
    if (version === feedConfig.version) {
      const snapshot = defaultSnapshot();
      setVersionCache(snapshot);
      return snapshot;
    }
    return null;
  }

  const snapshot = toSnapshot(row);
  setVersionCache(snapshot);
  return snapshot;
}

export async function listRankingConfigs(): Promise<RankingConfigSnapshot[]> {
  const rows = await db
    .select()
    .from(rankingConfigs)
    .orderBy(desc(rankingConfigs.isActive), desc(rankingConfigs.updatedAt));
  const snapshots = rows.map(toSnapshot);
  if (!snapshots.some((snapshot) => snapshot.version === feedConfig.version)) {
    snapshots.push(defaultSnapshot());
  }
  return snapshots;
}

export async function activateRankingConfig(
  version: string
): Promise<RankingConfigSnapshot | null> {
  const now = new Date();
  const snapshot = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(rankingConfigs)
      .where(eq(rankingConfigs.version, version))
      .limit(1);
    if (!existing) return null;

    await tx
      .update(rankingConfigs)
      .set({ isActive: false })
      .where(eq(rankingConfigs.isActive, true));

    const [updated] = await tx
      .update(rankingConfigs)
      .set({
        isActive: true,
        activatedAt: now,
        updatedAt: now,
      })
      .where(eq(rankingConfigs.version, version))
      .returning();
    return updated ? toSnapshot(updated) : null;
  });

  invalidateRankingConfigCache();
  if (!snapshot) return null;
  setVersionCache(snapshot);
  activeConfigCache = {
    snapshot,
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
  };
  return snapshot;
}

export async function upsertRankingConfig(input: {
  version: string;
  name?: string;
  notes?: string | null;
  config?: unknown;
  activate?: boolean;
}): Promise<RankingConfigSnapshot> {
  const version = input.version.trim();
  if (!version) {
    throw new Error("version is required");
  }

  const patch: FeedConfigPatch = validateFeedConfigPatch(input.config ?? {});
  const now = new Date();

  const snapshot = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(rankingConfigs)
      .where(eq(rankingConfigs.version, version))
      .limit(1);

    const baseConfig = existing
      ? normalizeFeedConfig(existing.config, version)
      : normalizeFeedConfig(feedConfig, version);
    const nextConfig = mergeFeedConfig(baseConfig, patch, version);

    let row: RankingConfigRow | undefined;
    if (existing) {
      [row] = await tx
        .update(rankingConfigs)
        .set({
          name: input.name?.trim() || existing.name,
          notes: input.notes ?? existing.notes,
          config: nextConfig,
          updatedAt: now,
        })
        .where(eq(rankingConfigs.version, version))
        .returning();
    } else {
      [row] = await tx
        .insert(rankingConfigs)
        .values({
          version,
          name: input.name?.trim() || version,
          notes: input.notes ?? null,
          config: nextConfig,
          isActive: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    }

    if (!row) {
      throw new Error("Failed to upsert ranking config");
    }

    if (input.activate) {
      await tx
        .update(rankingConfigs)
        .set({ isActive: false })
        .where(eq(rankingConfigs.isActive, true));
      [row] = await tx
        .update(rankingConfigs)
        .set({
          isActive: true,
          activatedAt: now,
          updatedAt: now,
        })
        .where(eq(rankingConfigs.version, version))
        .returning();
      if (!row) {
        throw new Error("Failed to activate ranking config");
      }
    }

    return toSnapshot(row);
  });

  invalidateRankingConfigCache();
  setVersionCache(snapshot);
  if (snapshot.is_active) {
    activeConfigCache = {
      snapshot,
      expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
    };
  }
  return snapshot;
}

export async function getRankingConfigOverview() {
  const [configs, active] = await Promise.all([
    listRankingConfigs(),
    getActiveRankingConfig(),
  ]);
  return {
    active,
    configs,
  };
}

export async function getRankingConfigCounts() {
  const [row] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(rankingConfigs);
  return row?.count ?? 0;
}
