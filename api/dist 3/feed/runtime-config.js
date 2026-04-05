"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateRankingConfigCache = invalidateRankingConfigCache;
exports.getActiveRankingConfig = getActiveRankingConfig;
exports.getRankingConfigByVersion = getRankingConfigByVersion;
exports.listRankingConfigs = listRankingConfigs;
exports.listRankingConfigAudits = listRankingConfigAudits;
exports.recordRankingConfigAudit = recordRankingConfigAudit;
exports.activateRankingConfig = activateRankingConfig;
exports.upsertRankingConfig = upsertRankingConfig;
exports.getRankingConfigOverview = getRankingConfigOverview;
exports.getRankingConfigCounts = getRankingConfigCounts;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const config_1 = require("./config");
const CONFIG_CACHE_TTL_MS = 60 * 1000;
let activeConfigCache = null;
const versionConfigCache = new Map();
function toSnapshot(row) {
    const config = (0, config_1.normalizeFeedConfig)(row.config, row.version);
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
function defaultSnapshot() {
    return {
        id: null,
        version: config_1.feedConfig.version,
        name: "Default feed config",
        notes: "Built-in fallback config",
        is_active: true,
        source: "default",
        config: (0, config_1.normalizeFeedConfig)(config_1.feedConfig),
        created_at: null,
        updated_at: null,
        activated_at: null,
    };
}
function setVersionCache(snapshot) {
    versionConfigCache.set(snapshot.version, {
        snapshot,
        expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
    });
}
function toAuditSnapshot(row) {
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
function sanitizeAuditInput(input) {
    return {
        actor: input?.actor?.trim() || null,
        reason: input?.reason?.trim() || null,
        source: input?.source?.trim() || null,
        requestIp: input?.requestIp?.trim() || null,
        userAgent: input?.userAgent?.trim() || null,
        metadata: input?.metadata ?? null,
    };
}
function invalidateRankingConfigCache(version) {
    activeConfigCache = null;
    if (version) {
        versionConfigCache.delete(version);
        return;
    }
    versionConfigCache.clear();
}
async function getActiveRankingConfig() {
    const now = Date.now();
    if (activeConfigCache && activeConfigCache.expiresAt > now) {
        return activeConfigCache.snapshot;
    }
    try {
        const [row] = await db_1.db
            .select()
            .from(db_1.rankingConfigs)
            .where((0, drizzle_orm_1.eq)(db_1.rankingConfigs.isActive, true))
            .orderBy((0, drizzle_orm_1.desc)(db_1.rankingConfigs.activatedAt), (0, drizzle_orm_1.desc)(db_1.rankingConfigs.updatedAt))
            .limit(1);
        const snapshot = row ? toSnapshot(row) : defaultSnapshot();
        activeConfigCache = {
            snapshot,
            expiresAt: now + CONFIG_CACHE_TTL_MS,
        };
        setVersionCache(snapshot);
        return snapshot;
    }
    catch (error) {
        console.warn("getActiveRankingConfig falling back to built-in config", {
            message: error instanceof Error ? error.message : String(error),
        });
        const snapshot = defaultSnapshot();
        activeConfigCache = {
            snapshot,
            expiresAt: now + CONFIG_CACHE_TTL_MS,
        };
        setVersionCache(snapshot);
        return snapshot;
    }
}
async function getRankingConfigByVersion(version) {
    const cached = versionConfigCache.get(version);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.snapshot;
    }
    try {
        const [row] = await db_1.db
            .select()
            .from(db_1.rankingConfigs)
            .where((0, drizzle_orm_1.eq)(db_1.rankingConfigs.version, version))
            .limit(1);
        if (!row) {
            if (version === config_1.feedConfig.version) {
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
    catch (error) {
        console.warn("getRankingConfigByVersion falling back", {
            version,
            message: error instanceof Error ? error.message : String(error),
        });
        if (version === config_1.feedConfig.version) {
            const snapshot = defaultSnapshot();
            setVersionCache(snapshot);
            return snapshot;
        }
        return null;
    }
}
async function listRankingConfigs() {
    try {
        const rows = await db_1.db
            .select()
            .from(db_1.rankingConfigs)
            .orderBy((0, drizzle_orm_1.desc)(db_1.rankingConfigs.isActive), (0, drizzle_orm_1.desc)(db_1.rankingConfigs.updatedAt));
        const snapshots = rows.map(toSnapshot);
        if (!snapshots.some((snapshot) => snapshot.version === config_1.feedConfig.version)) {
            snapshots.push(defaultSnapshot());
        }
        return snapshots;
    }
    catch (error) {
        console.warn("listRankingConfigs falling back to built-in config", {
            message: error instanceof Error ? error.message : String(error),
        });
        return [defaultSnapshot()];
    }
}
async function listRankingConfigAudits(limit = 50) {
    try {
        const rows = await db_1.db
            .select()
            .from(db_1.rankingConfigAudits)
            .orderBy((0, drizzle_orm_1.desc)(db_1.rankingConfigAudits.createdAt))
            .limit(Math.max(1, Math.min(200, limit)));
        return rows.map(toAuditSnapshot);
    }
    catch (error) {
        console.warn("listRankingConfigAudits returning empty audit list", {
            message: error instanceof Error ? error.message : String(error),
        });
        return [];
    }
}
async function recordRankingConfigAudit(input) {
    const audit = sanitizeAuditInput(input.audit);
    const [row] = await db_1.db
        .insert(db_1.rankingConfigAudits)
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
async function activateRankingConfig(version, options = {}) {
    const now = new Date();
    const audit = sanitizeAuditInput(options.audit);
    const snapshot = await db_1.db.transaction(async (tx) => {
        const [previousActive] = await tx
            .select()
            .from(db_1.rankingConfigs)
            .where((0, drizzle_orm_1.eq)(db_1.rankingConfigs.isActive, true))
            .limit(1);
        const [existing] = await tx
            .select()
            .from(db_1.rankingConfigs)
            .where((0, drizzle_orm_1.eq)(db_1.rankingConfigs.version, version))
            .limit(1);
        if (!existing)
            return null;
        await tx
            .update(db_1.rankingConfigs)
            .set({ isActive: false })
            .where((0, drizzle_orm_1.eq)(db_1.rankingConfigs.isActive, true));
        const [updated] = await tx
            .update(db_1.rankingConfigs)
            .set({
            isActive: true,
            activatedAt: now,
            updatedAt: now,
        })
            .where((0, drizzle_orm_1.eq)(db_1.rankingConfigs.version, version))
            .returning();
        if (updated) {
            await tx.insert(db_1.rankingConfigAudits).values({
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
    if (!snapshot)
        return null;
    setVersionCache(snapshot);
    activeConfigCache = {
        snapshot,
        expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
    };
    return snapshot;
}
async function upsertRankingConfig(input) {
    const version = input.version.trim();
    if (!version) {
        throw new Error("version is required");
    }
    const patch = (0, config_1.validateFeedConfigPatch)(input.config ?? {});
    const now = new Date();
    const audit = sanitizeAuditInput(input.audit);
    const snapshot = await db_1.db.transaction(async (tx) => {
        const [existing] = await tx
            .select()
            .from(db_1.rankingConfigs)
            .where((0, drizzle_orm_1.eq)(db_1.rankingConfigs.version, version))
            .limit(1);
        const baseConfig = existing
            ? (0, config_1.normalizeFeedConfig)(existing.config, version)
            : (0, config_1.normalizeFeedConfig)(config_1.feedConfig, version);
        const nextConfig = (0, config_1.mergeFeedConfig)(baseConfig, patch, version);
        let row;
        const previousAction = existing ? "update" : "create";
        if (existing) {
            [row] = await tx
                .update(db_1.rankingConfigs)
                .set({
                name: input.name?.trim() || existing.name,
                notes: input.notes ?? existing.notes,
                config: nextConfig,
                updatedAt: now,
            })
                .where((0, drizzle_orm_1.eq)(db_1.rankingConfigs.version, version))
                .returning();
        }
        else {
            [row] = await tx
                .insert(db_1.rankingConfigs)
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
        await tx.insert(db_1.rankingConfigAudits).values({
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
                .from(db_1.rankingConfigs)
                .where((0, drizzle_orm_1.eq)(db_1.rankingConfigs.isActive, true))
                .limit(1);
            await tx
                .update(db_1.rankingConfigs)
                .set({ isActive: false })
                .where((0, drizzle_orm_1.eq)(db_1.rankingConfigs.isActive, true));
            [row] = await tx
                .update(db_1.rankingConfigs)
                .set({
                isActive: true,
                activatedAt: now,
                updatedAt: now,
            })
                .where((0, drizzle_orm_1.eq)(db_1.rankingConfigs.version, version))
                .returning();
            if (!row) {
                throw new Error("Failed to activate ranking config");
            }
            await tx.insert(db_1.rankingConfigAudits).values({
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
async function getRankingConfigOverview() {
    const [configs, active] = await Promise.all([
        listRankingConfigs(),
        getActiveRankingConfig(),
    ]);
    return {
        active,
        configs,
    };
}
async function getRankingConfigCounts() {
    const [row] = await db_1.db
        .select({ count: (0, drizzle_orm_1.sql) `cast(count(*) as int)` })
        .from(db_1.rankingConfigs);
    return row?.count ?? 0;
}
