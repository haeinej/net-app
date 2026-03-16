import { desc, eq, sql } from "drizzle-orm";
import { db, rankingConfigAudits, rankingConfigs } from "../db";
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
type RankingConfigAuditRow = typeof rankingConfigAudits.$inferSelect;

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

export type RankingConfigAuditSnapshot = {
  id: string;
  config_version: string;
  action: string;
  outcome: string;
  previous_active_version: string | null;
  actor: string | null;
  reason: string | null;
  source: string | null;
  request_ip: string | null;
  user_agent: string | null;
  config_snapshot: unknown;
  metadata: unknown;
  created_at: string;
};

export type RankingConfigAuditInput = {
  actor?: string | null;
  reason?: string | null;
  source?: string | null;
  requestIp?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
};

type ActivationOptions = {
  auditAction?: "activate" | "promote";
  auditOutcome?: "success" | "blocked" | "forced";
  audit?: RankingConfigAuditInput;
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

function toAuditSnapshot(row: RankingConfigAuditRow): RankingConfigAuditSnapshot {
  return {
    id: row.id,
    config_version: row.configVersion,
    action: row.action,
    outcome: row.outcome,
    previous_active_version: row.previousActiveVersion ?? null,
    actor: row.actor ?? null,
    reason: row.reason ?? null,
    source: row.source ?? null,
    request_ip: row.requestIp ?? null,
    user_agent: row.userAgent ?? null,
    config_snapshot: row.configSnapshot ?? null,
    metadata: row.metadata ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

function sanitizeAuditInput(
  input: RankingConfigAuditInput | undefined
): RankingConfigAuditInput {
  return {
    actor: input?.actor?.trim() || null,
    reason: input?.reason?.trim() || null,
    source: input?.source?.trim() || null,
    requestIp: input?.requestIp?.trim() || null,
    userAgent: input?.userAgent?.trim() || null,
    metadata: input?.metadata ?? null,
  };
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

export async function listRankingConfigAudits(
  limit: number = 50
): Promise<RankingConfigAuditSnapshot[]> {
  const rows = await db
    .select()
    .from(rankingConfigAudits)
    .orderBy(desc(rankingConfigAudits.createdAt))
    .limit(Math.max(1, Math.min(200, limit)));
  return rows.map(toAuditSnapshot);
}

export async function recordRankingConfigAudit(input: {
  configVersion: string;
  action: string;
  outcome?: string;
  previousActiveVersion?: string | null;
  configSnapshot?: unknown;
  audit?: RankingConfigAuditInput;
}): Promise<RankingConfigAuditSnapshot> {
  const audit = sanitizeAuditInput(input.audit);
  const [row] = await db
    .insert(rankingConfigAudits)
    .values({
      configVersion: input.configVersion,
      action: input.action,
      outcome: input.outcome ?? "success",
      previousActiveVersion: input.previousActiveVersion ?? null,
      actor: audit.actor ?? null,
      reason: audit.reason ?? null,
      source: audit.source ?? null,
      requestIp: audit.requestIp ?? null,
      userAgent: audit.userAgent ?? null,
      configSnapshot: input.configSnapshot ?? null,
      metadata: audit.metadata ?? null,
      createdAt: new Date(),
    })
    .returning();
  if (!row) {
    throw new Error("Failed to record ranking config audit");
  }
  return toAuditSnapshot(row);
}

export async function activateRankingConfig(
  version: string,
  options: ActivationOptions = {}
): Promise<RankingConfigSnapshot | null> {
  const now = new Date();
  const audit = sanitizeAuditInput(options.audit);
  const snapshot = await db.transaction(async (tx) => {
    const [previousActive] = await tx
      .select()
      .from(rankingConfigs)
      .where(eq(rankingConfigs.isActive, true))
      .limit(1);
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
    if (updated) {
      await tx.insert(rankingConfigAudits).values({
        configVersion: version,
        action: options.auditAction ?? "activate",
        outcome: options.auditOutcome ?? "success",
        previousActiveVersion: previousActive?.version ?? null,
        actor: audit.actor ?? null,
        reason: audit.reason ?? null,
        source: audit.source ?? null,
        requestIp: audit.requestIp ?? null,
        userAgent: audit.userAgent ?? null,
        configSnapshot: toSnapshot(updated),
        metadata: audit.metadata ?? null,
        createdAt: now,
      });
    }
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
  audit?: RankingConfigAuditInput;
}): Promise<RankingConfigSnapshot> {
  const version = input.version.trim();
  if (!version) {
    throw new Error("version is required");
  }

  const patch: FeedConfigPatch = validateFeedConfigPatch(input.config ?? {});
  const now = new Date();
  const audit = sanitizeAuditInput(input.audit);

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
    const previousAction = existing ? "update" : "create";
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

    await tx.insert(rankingConfigAudits).values({
      configVersion: version,
      action: previousAction,
      outcome: "success",
      previousActiveVersion: null,
      actor: audit.actor ?? null,
      reason: audit.reason ?? null,
      source: audit.source ?? null,
      requestIp: audit.requestIp ?? null,
      userAgent: audit.userAgent ?? null,
      configSnapshot: toSnapshot(row),
      metadata: audit.metadata ?? null,
      createdAt: now,
    });

    if (input.activate) {
      const [previousActive] = await tx
        .select()
        .from(rankingConfigs)
        .where(eq(rankingConfigs.isActive, true))
        .limit(1);
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
      await tx.insert(rankingConfigAudits).values({
        configVersion: version,
        action: "activate",
        outcome: "success",
        previousActiveVersion: previousActive?.version ?? null,
        actor: audit.actor ?? null,
        reason: audit.reason ?? null,
        source: audit.source ?? null,
        requestIp: audit.requestIp ?? null,
        userAgent: audit.userAgent ?? null,
        configSnapshot: toSnapshot(row),
        metadata: audit.metadata ?? null,
        createdAt: now,
      });
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
