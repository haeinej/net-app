"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blocks = exports.manualBoosts = exports.pushTokens = exports.reports = exports.crossingReplies = exports.crossings = exports.crossingDrafts = exports.learningJobLock = exports.learningLog = exports.rankingConfigAudits = exports.rankingConfigs = exports.systemConfig = exports.crossDomainAffinity = exports.imageGenerations = exports.failedProcessingJobs = exports.userFeedProfiles = exports.userRecommendationWeights = exports.crossClusterAffinity = exports.questionClusters = exports.feedSnapshots = exports.feedServes = exports.engagementEvents = exports.messages = exports.conversations = exports.thoughtFeedStats = exports.replies = exports.thoughts = exports.waitlistSignups = exports.emailVerificationCodes = exports.inviteCodes = exports.users = exports.crossingDraftStatusEnum = exports.engagementEventTypeEnum = exports.reportTargetTypeEnum = exports.reportStatusEnum = exports.reportReasonEnum = exports.replyStatusEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const VECTOR_DIMS = 768;
// Enums
exports.replyStatusEnum = (0, pg_core_1.pgEnum)("reply_status", [
    "pending",
    "accepted",
    "deleted",
]);
exports.reportReasonEnum = (0, pg_core_1.pgEnum)("report_reason", [
    "harassment",
    "hate_speech",
    "spam",
    "sexual_content",
    "violence",
    "self_harm",
    "other",
]);
exports.reportStatusEnum = (0, pg_core_1.pgEnum)("report_status", [
    "pending",
    "reviewed",
    "actioned",
    "dismissed",
]);
exports.reportTargetTypeEnum = (0, pg_core_1.pgEnum)("report_target_type", [
    "thought",
    "reply",
    "crossing",
    "crossing_reply",
    "message",
    "user",
]);
exports.engagementEventTypeEnum = (0, pg_core_1.pgEnum)("engagement_event_type", [
    "view_p1",
    "swipe_p2",
    "swipe_p3",
    "type_start",
    "reply_sent",
    "reply_accepted",
]);
exports.crossingDraftStatusEnum = (0, pg_core_1.pgEnum)("crossing_draft_status", [
    "draft",
    "awaiting_other",
    "complete",
    "abandoned",
    "auto_posted",
]);
// 1. users
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    name: (0, pg_core_1.text)("name"),
    photoUrl: (0, pg_core_1.text)("photo_url"),
    cohortYear: (0, pg_core_1.integer)("cohort_year"),
    currentCity: (0, pg_core_1.text)("current_city"),
    concentration: (0, pg_core_1.text)("concentration"),
    interests: (0, pg_core_1.text)("interests").array(), // internal cold-start strings, max 3
    email: (0, pg_core_1.text)("email").unique(),
    passwordHash: (0, pg_core_1.text)("password_hash"),
    emailVerifiedAt: (0, pg_core_1.timestamp)("email_verified_at", { withTimezone: true }),
    termsAcceptedAt: (0, pg_core_1.timestamp)("terms_accepted_at", { withTimezone: true }),
    invitedByUserId: (0, pg_core_1.uuid)("invited_by_user_id"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
});
// 1b. invite_codes
exports.inviteCodes = (0, pg_core_1.pgTable)("invite_codes", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    code: (0, pg_core_1.text)("code").notNull(),
    createdByUserId: (0, pg_core_1.uuid)("created_by_user_id")
        .notNull()
        .references(() => exports.users.id, { onDelete: "cascade" }),
    redeemedByUserId: (0, pg_core_1.uuid)("redeemed_by_user_id").references(() => exports.users.id, {
        onDelete: "set null",
    }),
    redeemedAt: (0, pg_core_1.timestamp)("redeemed_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("invite_codes_code_unique").on(table.code),
    (0, pg_core_1.index)("invite_codes_created_by_idx").on(table.createdByUserId),
]);
exports.emailVerificationCodes = (0, pg_core_1.pgTable)("email_verification_codes", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => exports.users.id),
    codeHash: (0, pg_core_1.text)("code_hash").notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { withTimezone: true }).notNull(),
    consumedAt: (0, pg_core_1.timestamp)("consumed_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.index)("email_verification_codes_user_created_idx").on(table.userId, table.createdAt.desc()),
    (0, pg_core_1.uniqueIndex)("email_verification_codes_active_user_unique")
        .on(table.userId)
        .where((0, drizzle_orm_1.sql) `${table.consumedAt} is null`),
]);
exports.waitlistSignups = (0, pg_core_1.pgTable)("waitlist_signups", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    email: (0, pg_core_1.text)("email").notNull(),
    source: (0, pg_core_1.text)("source").notNull().default("website"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [(0, pg_core_1.uniqueIndex)("waitlist_signups_email_unique").on(table.email)]);
// 2. thoughts
exports.thoughts = (0, pg_core_1.pgTable)("thoughts", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => exports.users.id),
    sentence: (0, pg_core_1.text)("sentence").notNull(),
    context: (0, pg_core_1.text)("context"),
    photoUrl: (0, pg_core_1.text)("photo_url"),
    imageUrl: (0, pg_core_1.text)("image_url"), // deprecated legacy generated image URL
    imageMetadata: (0, pg_core_1.jsonb)("image_metadata"), // deprecated fal.ai metadata
    surfaceEmbedding: (0, pg_core_1.vector)("surface_embedding", { dimensions: VECTOR_DIMS }),
    questionEmbedding: (0, pg_core_1.vector)("question_embedding", { dimensions: VECTOR_DIMS }), // primary resonance embedding stored in legacy column
    qualityScore: (0, pg_core_1.real)("quality_score"), // openness-weighted signal
    clusterId: (0, pg_core_1.uuid)("cluster_id"), // FK to resonance clusters, set by weekly learning
    deletedAt: (0, pg_core_1.timestamp)("deleted_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.index)("thoughts_user_created_idx").on(table.userId, table.createdAt.desc()),
    (0, pg_core_1.index)("thoughts_surface_embedding_hnsw").using("hnsw", table.surfaceEmbedding.op("vector_cosine_ops")),
    (0, pg_core_1.index)("thoughts_question_embedding_hnsw").using("hnsw", table.questionEmbedding.op("vector_cosine_ops")),
]);
// 3. replies
exports.replies = (0, pg_core_1.pgTable)("replies", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    thoughtId: (0, pg_core_1.uuid)("thought_id")
        .notNull()
        .references(() => exports.thoughts.id),
    replierId: (0, pg_core_1.uuid)("replier_id")
        .notNull()
        .references(() => exports.users.id),
    text: (0, pg_core_1.text)("text").notNull(),
    status: (0, exports.replyStatusEnum)("status").notNull().default("pending"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [(0, pg_core_1.index)("replies_thought_status_idx").on(table.thoughtId, table.status)]);
// 3b. thought_feed_stats (materialized reply / conversation quality signals per thought)
exports.thoughtFeedStats = (0, pg_core_1.pgTable)("thought_feed_stats", {
    thoughtId: (0, pg_core_1.uuid)("thought_id")
        .primaryKey()
        .references(() => exports.thoughts.id, { onDelete: "cascade" }),
    acceptedReplyCount: (0, pg_core_1.integer)("accepted_reply_count").notNull().default(0),
    crossDomainAcceptedReplyCount: (0, pg_core_1.integer)("cross_domain_accepted_reply_count")
        .notNull()
        .default(0),
    sustainedConversationCount: (0, pg_core_1.integer)("sustained_conversation_count").notNull().default(0),
    maxConversationDepth: (0, pg_core_1.integer)("max_conversation_depth").notNull().default(0),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).defaultNow(),
});
// 4. conversations
exports.conversations = (0, pg_core_1.pgTable)("conversations", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    thoughtId: (0, pg_core_1.uuid)("thought_id")
        .notNull()
        .references(() => exports.thoughts.id),
    replyId: (0, pg_core_1.uuid)("reply_id")
        .notNull()
        .references(() => exports.replies.id),
    participantA: (0, pg_core_1.uuid)("participant_a")
        .notNull()
        .references(() => exports.users.id),
    participantB: (0, pg_core_1.uuid)("participant_b")
        .notNull()
        .references(() => exports.users.id),
    messageCount: (0, pg_core_1.integer)("message_count").default(0),
    lastMessageAt: (0, pg_core_1.timestamp)("last_message_at", { withTimezone: true }),
    participantASeenAt: (0, pg_core_1.timestamp)("participant_a_seen_at", { withTimezone: true }),
    participantBSeenAt: (0, pg_core_1.timestamp)("participant_b_seen_at", { withTimezone: true }),
    isDormant: (0, pg_core_1.boolean)("is_dormant").default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.index)("conversations_participant_a_idx").on(table.participantA),
    (0, pg_core_1.index)("conversations_participant_b_idx").on(table.participantB),
    (0, pg_core_1.index)("conversations_last_message_at_idx").on(table.lastMessageAt.desc()),
    (0, pg_core_1.index)("conversations_participant_a_last_msg_idx").on(table.participantA, table.lastMessageAt.desc()),
    (0, pg_core_1.index)("conversations_participant_b_last_msg_idx").on(table.participantB, table.lastMessageAt.desc()),
    (0, pg_core_1.uniqueIndex)("conversations_reply_id_unique").on(table.replyId),
]);
// 5. messages
exports.messages = (0, pg_core_1.pgTable)("messages", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    conversationId: (0, pg_core_1.uuid)("conversation_id")
        .notNull()
        .references(() => exports.conversations.id),
    senderId: (0, pg_core_1.uuid)("sender_id")
        .notNull()
        .references(() => exports.users.id),
    text: (0, pg_core_1.text)("text").notNull(),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.index)("messages_conversation_created_idx").on(table.conversationId, table.createdAt),
]);
// 6. engagement_events
exports.engagementEvents = (0, pg_core_1.pgTable)("engagement_events", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => exports.users.id),
    thoughtId: (0, pg_core_1.uuid)("thought_id")
        .notNull()
        .references(() => exports.thoughts.id),
    eventType: (0, exports.engagementEventTypeEnum)("event_type").notNull(),
    sessionId: (0, pg_core_1.text)("session_id"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.index)("engagement_events_user_thought_type_idx").on(table.userId, table.thoughtId, table.eventType),
]);
// 7. feed_serves (internal attribution for ranking evaluation)
exports.feedServes = (0, pg_core_1.pgTable)("feed_serves", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    requestId: (0, pg_core_1.text)("request_id").notNull(),
    viewerId: (0, pg_core_1.uuid)("viewer_id")
        .notNull()
        .references(() => exports.users.id, { onDelete: "cascade" }),
    itemType: (0, pg_core_1.text)("item_type").notNull(),
    thoughtId: (0, pg_core_1.uuid)("thought_id").references(() => exports.thoughts.id, {
        onDelete: "set null",
    }),
    crossingId: (0, pg_core_1.uuid)("crossing_id"),
    authorId: (0, pg_core_1.uuid)("author_id").references(() => exports.users.id, {
        onDelete: "cascade",
    }),
    position: (0, pg_core_1.integer)("position").notNull(),
    bucket: (0, pg_core_1.text)("bucket"),
    stage: (0, pg_core_1.text)("stage"),
    phaseUsed: (0, pg_core_1.text)("phase_used"),
    scoreQ: (0, pg_core_1.real)("score_q"),
    scoreD: (0, pg_core_1.real)("score_d"),
    scoreF: (0, pg_core_1.real)("score_f"),
    scoreR: (0, pg_core_1.real)("score_r"),
    finalRank: (0, pg_core_1.real)("final_rank"),
    resonanceSimilarity: (0, pg_core_1.real)("resonance_similarity"),
    surfaceSimilarity: (0, pg_core_1.real)("surface_similarity"),
    configVersion: (0, pg_core_1.text)("config_version").notNull(),
    servedAt: (0, pg_core_1.timestamp)("served_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("feed_serves_request_position_unique").on(table.requestId, table.position),
    (0, pg_core_1.index)("feed_serves_viewer_served_idx").on(table.viewerId, table.servedAt.desc()),
    (0, pg_core_1.index)("feed_serves_thought_served_idx").on(table.thoughtId, table.servedAt.desc()),
    (0, pg_core_1.index)("feed_serves_bucket_served_idx").on(table.bucket, table.servedAt.desc()),
]);
exports.feedSnapshots = (0, pg_core_1.pgTable)("feed_snapshots", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    viewerId: (0, pg_core_1.uuid)("viewer_id")
        .notNull()
        .references(() => exports.users.id, { onDelete: "cascade" }),
    configVersion: (0, pg_core_1.text)("config_version").notNull(),
    items: (0, pg_core_1.jsonb)("items").notNull(),
    traces: (0, pg_core_1.jsonb)("traces").notNull(),
    hasMore: (0, pg_core_1.boolean)("has_more").notNull().default(false),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { withTimezone: true }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    (0, pg_core_1.index)("feed_snapshots_viewer_expires_idx").on(table.viewerId, table.expiresAt.desc()),
    (0, pg_core_1.index)("feed_snapshots_expires_idx").on(table.expiresAt),
]);
// 8. question_clusters (legacy name; currently used as resonance clusters)
exports.questionClusters = (0, pg_core_1.pgTable)("question_clusters", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    centroidEmbedding: (0, pg_core_1.vector)("centroid_embedding", { dimensions: VECTOR_DIMS }),
    label: (0, pg_core_1.text)("label"),
    sampleQuestions: (0, pg_core_1.text)("sample_questions").array(),
    thoughtCount: (0, pg_core_1.integer)("thought_count"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
});
// 9. cross_cluster_affinity (populated later)
exports.crossClusterAffinity = (0, pg_core_1.pgTable)("cross_cluster_affinity", {
    clusterAId: (0, pg_core_1.uuid)("cluster_a_id")
        .notNull()
        .references(() => exports.questionClusters.id),
    clusterBId: (0, pg_core_1.uuid)("cluster_b_id")
        .notNull()
        .references(() => exports.questionClusters.id),
    replyRate: (0, pg_core_1.real)("reply_rate"),
    conversationRate: (0, pg_core_1.real)("conversation_rate"),
    sustainRate: (0, pg_core_1.real)("sustain_rate"),
    avgConversationDepth: (0, pg_core_1.real)("avg_conversation_depth"),
}, (table) => [
    (0, pg_core_1.primaryKey)({ columns: [table.clusterAId, table.clusterBId] }),
]);
// 10. user_recommendation_weights (populated by learning loop)
exports.userRecommendationWeights = (0, pg_core_1.pgTable)("user_recommendation_weights", {
    userId: (0, pg_core_1.uuid)("user_id")
        .primaryKey()
        .references(() => exports.users.id),
    qWeight: (0, pg_core_1.real)("q_weight").default(0.4),
    dWeight: (0, pg_core_1.real)("d_weight").default(0.25),
    fWeight: (0, pg_core_1.real)("f_weight").default(0.2),
    rWeight: (0, pg_core_1.real)("r_weight").default(0.15),
    alpha: (0, pg_core_1.real)("alpha").default(0.3),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).defaultNow(),
});
exports.userFeedProfiles = (0, pg_core_1.pgTable)("user_feed_profiles", {
    userId: (0, pg_core_1.uuid)("user_id")
        .primaryKey()
        .references(() => exports.users.id, { onDelete: "cascade" }),
    resonanceCentroid: (0, pg_core_1.vector)("resonance_centroid", { dimensions: VECTOR_DIMS }),
    surfaceCentroid: (0, pg_core_1.vector)("surface_centroid", { dimensions: VECTOR_DIMS }),
    recentClusterIds: (0, pg_core_1.uuid)("recent_cluster_ids").array(),
    embeddedThoughtCount: (0, pg_core_1.integer)("embedded_thought_count").notNull().default(0),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [(0, pg_core_1.index)("user_feed_profiles_updated_idx").on(table.updatedAt.desc())]);
// 11. failed_processing_jobs (Phase 3 + 4 — embedding pipeline or image generation retry)
exports.failedProcessingJobs = (0, pg_core_1.pgTable)("failed_processing_jobs", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    thoughtId: (0, pg_core_1.uuid)("thought_id")
        .notNull()
        .references(() => exports.thoughts.id),
    jobType: (0, pg_core_1.text)("job_type").default("embedding"), // 'embedding' | 'image'
    error: (0, pg_core_1.text)("error"),
    retryCount: (0, pg_core_1.integer)("retry_count").default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [(0, pg_core_1.index)("failed_processing_jobs_thought_id_idx").on(table.thoughtId)]);
// 12. image_generations (Phase 4 — daily cap per user)
exports.imageGenerations = (0, pg_core_1.pgTable)("image_generations", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => exports.users.id),
    thoughtId: (0, pg_core_1.uuid)("thought_id").references(() => exports.thoughts.id),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.index)("image_generations_user_created_idx").on(table.userId, table.createdAt),
]);
// 13. cross_domain_affinity (Phase 7 — concentration pairs, daily job)
exports.crossDomainAffinity = (0, pg_core_1.pgTable)("cross_domain_affinity", {
    concentrationA: (0, pg_core_1.text)("concentration_a").notNull(),
    concentrationB: (0, pg_core_1.text)("concentration_b").notNull(),
    totalConversations: (0, pg_core_1.integer)("total_conversations").notNull().default(0),
    sustainedConversations: (0, pg_core_1.integer)("sustained_conversations").notNull().default(0),
    sustainRate: (0, pg_core_1.real)("sustain_rate"),
    avgDepth: (0, pg_core_1.real)("avg_depth"),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.primaryKey)({ columns: [table.concentrationA, table.concentrationB] }),
]);
// 14. system_config (Phase 7 — learned config, e.g. temporal resonance weights)
exports.systemConfig = (0, pg_core_1.pgTable)("system_config", {
    key: (0, pg_core_1.text)("key").primaryKey(),
    value: (0, pg_core_1.jsonb)("value").notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).defaultNow(),
});
// 15. ranking_configs (internal control plane for feed tuning)
exports.rankingConfigs = (0, pg_core_1.pgTable)("ranking_configs", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    version: (0, pg_core_1.text)("version").notNull().unique(),
    name: (0, pg_core_1.text)("name").notNull(),
    notes: (0, pg_core_1.text)("notes"),
    config: (0, pg_core_1.jsonb)("config").notNull(),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).defaultNow().notNull(),
    activatedAt: (0, pg_core_1.timestamp)("activated_at", { withTimezone: true }),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("ranking_configs_active_unique")
        .on(table.isActive)
        .where((0, drizzle_orm_1.sql) `${table.isActive} = true`),
    (0, pg_core_1.index)("ranking_configs_updated_idx").on(table.updatedAt.desc()),
]);
// 15b. ranking_config_audits (internal config history + promotion decisions)
exports.rankingConfigAudits = (0, pg_core_1.pgTable)("ranking_config_audits", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    configVersion: (0, pg_core_1.text)("config_version").notNull(),
    action: (0, pg_core_1.text)("action").notNull(),
    outcome: (0, pg_core_1.text)("outcome").notNull().default("success"),
    previousActiveVersion: (0, pg_core_1.text)("previous_active_version"),
    actor: (0, pg_core_1.text)("actor"),
    reason: (0, pg_core_1.text)("reason"),
    source: (0, pg_core_1.text)("source"),
    requestIp: (0, pg_core_1.text)("request_ip"),
    userAgent: (0, pg_core_1.text)("user_agent"),
    configSnapshot: (0, pg_core_1.jsonb)("config_snapshot"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    (0, pg_core_1.index)("ranking_config_audits_config_created_idx").on(table.configVersion, table.createdAt.desc()),
    (0, pg_core_1.index)("ranking_config_audits_created_idx").on(table.createdAt.desc()),
]);
// 16. learning_log (Phase 7 — job runs and details)
exports.learningLog = (0, pg_core_1.pgTable)("learning_log", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    jobType: (0, pg_core_1.text)("job_type").notNull(), // 'daily' | 'weekly'
    timestamp: (0, pg_core_1.timestamp)("timestamp", { withTimezone: true }).defaultNow(),
    details: (0, pg_core_1.jsonb)("details"),
});
// 17. learning_job_lock (Phase 7 — prevent concurrent runs)
exports.learningJobLock = (0, pg_core_1.pgTable)("learning_job_lock", {
    jobType: (0, pg_core_1.text)("job_type").primaryKey(),
    lockedAt: (0, pg_core_1.timestamp)("locked_at", { withTimezone: true }).notNull(),
    lockedBy: (0, pg_core_1.text)("locked_by").notNull(),
});
// 18. crossing_drafts (the only active crossing draft: one line + optional context)
exports.crossingDrafts = (0, pg_core_1.pgTable)("crossing_drafts", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    conversationId: (0, pg_core_1.uuid)("conversation_id")
        .notNull()
        .references(() => exports.conversations.id),
    initiatorId: (0, pg_core_1.uuid)("initiator_id")
        .notNull()
        .references(() => exports.users.id),
    sentence: (0, pg_core_1.text)("sentence_a"),
    sentenceB: (0, pg_core_1.text)("sentence_b"),
    context: (0, pg_core_1.text)("context"),
    submittedAt: (0, pg_core_1.timestamp)("submitted_at", { withTimezone: true }),
    autoPostAt: (0, pg_core_1.timestamp)("auto_post_at", { withTimezone: true }),
    autoPostedThoughtId: (0, pg_core_1.uuid)("auto_posted_thought_id").references(() => exports.thoughts.id),
    status: (0, exports.crossingDraftStatusEnum)("status").notNull().default("draft"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("crossing_drafts_active_conversation_unique")
        .on(table.conversationId)
        .where((0, drizzle_orm_1.sql) `${table.status} in ('draft', 'awaiting_other')`),
]);
// 19. crossings (completed shared crossings shown in the app)
exports.crossings = (0, pg_core_1.pgTable)("crossings", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    conversationId: (0, pg_core_1.uuid)("conversation_id")
        .notNull()
        .references(() => exports.conversations.id),
    sourceDraftId: (0, pg_core_1.uuid)("source_draft_id").references(() => exports.crossingDrafts.id),
    participantA: (0, pg_core_1.uuid)("participant_a")
        .notNull()
        .references(() => exports.users.id),
    participantB: (0, pg_core_1.uuid)("participant_b")
        .notNull()
        .references(() => exports.users.id),
    sentence: (0, pg_core_1.text)("sentence").notNull(),
    sentenceA: (0, pg_core_1.text)("sentence_a"),
    sentenceB: (0, pg_core_1.text)("sentence_b"),
    context: (0, pg_core_1.text)("context"),
    imageUrl: (0, pg_core_1.text)("image_url"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("crossings_source_draft_unique")
        .on(table.sourceDraftId)
        .where((0, drizzle_orm_1.sql) `${table.sourceDraftId} is not null`),
    (0, pg_core_1.index)("crossings_participant_a_created_idx").on(table.participantA, table.createdAt.desc()),
    (0, pg_core_1.index)("crossings_participant_b_created_idx").on(table.participantB, table.createdAt.desc()),
]);
// 19b. crossing_replies (replies to crossings, tagged to a participant)
exports.crossingReplies = (0, pg_core_1.pgTable)("crossing_replies", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    crossingId: (0, pg_core_1.uuid)("crossing_id")
        .notNull()
        .references(() => exports.crossings.id),
    replierId: (0, pg_core_1.uuid)("replier_id")
        .notNull()
        .references(() => exports.users.id),
    targetParticipantId: (0, pg_core_1.uuid)("target_participant_id")
        .notNull()
        .references(() => exports.users.id),
    text: (0, pg_core_1.text)("text").notNull(),
    status: (0, exports.replyStatusEnum)("status").notNull().default("pending"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.index)("crossing_replies_crossing_status_idx").on(table.crossingId, table.status),
    (0, pg_core_1.uniqueIndex)("crossing_replies_pending_unique")
        .on(table.crossingId, table.replierId)
        .where((0, drizzle_orm_1.sql) `${table.status} = 'pending'`),
]);
// 20. reports (user-flagged objectionable content)
exports.reports = (0, pg_core_1.pgTable)("reports", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    reporterId: (0, pg_core_1.uuid)("reporter_id")
        .notNull()
        .references(() => exports.users.id),
    targetType: (0, exports.reportTargetTypeEnum)("target_type").notNull(),
    targetId: (0, pg_core_1.uuid)("target_id").notNull(),
    targetUserId: (0, pg_core_1.uuid)("target_user_id").references(() => exports.users.id),
    reason: (0, exports.reportReasonEnum)("reason").notNull(),
    description: (0, pg_core_1.text)("description"),
    status: (0, exports.reportStatusEnum)("status").notNull().default("pending"),
    reviewedAt: (0, pg_core_1.timestamp)("reviewed_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.index)("reports_reporter_idx").on(table.reporterId),
    (0, pg_core_1.index)("reports_target_idx").on(table.targetType, table.targetId),
    (0, pg_core_1.index)("reports_status_idx").on(table.status, table.createdAt.desc()),
]);
// 21. push_tokens (Expo push notification tokens per device)
exports.pushTokens = (0, pg_core_1.pgTable)("push_tokens", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => exports.users.id, { onDelete: "cascade" }),
    token: (0, pg_core_1.text)("token").notNull(),
    platform: (0, pg_core_1.text)("platform").notNull(), // 'ios' | 'android'
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("push_tokens_token_unique").on(table.token),
    (0, pg_core_1.index)("push_tokens_user_idx").on(table.userId),
]);
// 22. manual_boosts (Wizard of Oz — admin-curated feed injections)
exports.manualBoosts = (0, pg_core_1.pgTable)("manual_boosts", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    targetUserId: (0, pg_core_1.uuid)("target_user_id")
        .notNull()
        .references(() => exports.users.id, { onDelete: "cascade" }),
    thoughtId: (0, pg_core_1.uuid)("thought_id")
        .notNull()
        .references(() => exports.thoughts.id, { onDelete: "cascade" }),
    createdBy: (0, pg_core_1.text)("created_by").notNull(),
    reason: (0, pg_core_1.text)("reason"),
    consumedAt: (0, pg_core_1.timestamp)("consumed_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.index)("manual_boosts_target_pending_idx")
        .on(table.targetUserId),
    (0, pg_core_1.index)("manual_boosts_created_idx").on(table.createdAt),
]);
// 23. blocks (user blocks — hides content and notifies developer)
exports.blocks = (0, pg_core_1.pgTable)("blocks", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    blockerId: (0, pg_core_1.uuid)("blocker_id")
        .notNull()
        .references(() => exports.users.id),
    blockedId: (0, pg_core_1.uuid)("blocked_id")
        .notNull()
        .references(() => exports.users.id),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)("blocks_pair_unique").on(table.blockerId, table.blockedId),
    (0, pg_core_1.index)("blocks_blocker_idx").on(table.blockerId),
    (0, pg_core_1.index)("blocks_blocked_idx").on(table.blockedId),
]);
