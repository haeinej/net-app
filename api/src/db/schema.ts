import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
  integer,
  timestamp,
  real,
  boolean,
  jsonb,
  vector,
} from "drizzle-orm/pg-core";

const VECTOR_DIMS = 768;

// Enums
export const replyStatusEnum = pgEnum("reply_status", [
  "pending",
  "accepted",
  "deleted",
]);

export const engagementEventTypeEnum = pgEnum("engagement_event_type", [
  "view_p1",
  "swipe_p2",
  "swipe_p3",
  "type_start",
  "reply_sent",
  "reply_accepted",
]);

export const crossingDraftStatusEnum = pgEnum("crossing_draft_status", [
  "draft",
  "complete",
  "abandoned",
]);
export const shiftDraftStatusEnum = pgEnum("shift_draft_status", [
  "draft",
  "complete",
  "abandoned",
]);

// 1. users
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  photoUrl: text("photo_url"),
  cohortYear: integer("cohort_year"),
  currentCity: text("current_city"),
  concentration: text("concentration"),
  interests: text("interests").array(), // internal cold-start strings, max 3
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 2. thoughts
export const thoughts = pgTable(
  "thoughts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    sentence: text("sentence").notNull(),
    context: text("context"),
    photoUrl: text("photo_url"),
    imageUrl: text("image_url"), // deprecated legacy generated image URL
    imageMetadata: jsonb("image_metadata"), // deprecated fal.ai metadata
    surfaceEmbedding: vector("surface_embedding", { dimensions: VECTOR_DIMS }),
    questionEmbedding: vector("question_embedding", { dimensions: VECTOR_DIMS }), // primary resonance embedding stored in legacy column
    qualityScore: real("quality_score"), // openness-weighted signal
    clusterId: uuid("cluster_id"), // FK to resonance clusters, set by weekly learning
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("thoughts_user_created_idx").on(
      table.userId,
      table.createdAt.desc()
    ),
    index("thoughts_surface_embedding_hnsw").using(
      "hnsw",
      table.surfaceEmbedding.op("vector_cosine_ops")
    ),
    index("thoughts_question_embedding_hnsw").using(
      "hnsw",
      table.questionEmbedding.op("vector_cosine_ops")
    ),
  ]
);

// 3. replies
export const replies = pgTable(
  "replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    thoughtId: uuid("thought_id")
      .notNull()
      .references(() => thoughts.id),
    replierId: uuid("replier_id")
      .notNull()
      .references(() => users.id),
    text: text("text").notNull(),
    status: replyStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("replies_thought_status_idx").on(table.thoughtId, table.status)]
);

// 4. conversations
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    thoughtId: uuid("thought_id")
      .notNull()
      .references(() => thoughts.id),
    replyId: uuid("reply_id")
      .notNull()
      .references(() => replies.id),
    participantA: uuid("participant_a")
      .notNull()
      .references(() => users.id),
    participantB: uuid("participant_b")
      .notNull()
      .references(() => users.id),
    messageCount: integer("message_count").default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    participantASeenAt: timestamp("participant_a_seen_at", { withTimezone: true }),
    participantBSeenAt: timestamp("participant_b_seen_at", { withTimezone: true }),
    isDormant: boolean("is_dormant").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("conversations_participant_a_idx").on(table.participantA),
    index("conversations_participant_b_idx").on(table.participantB),
    index("conversations_last_message_at_idx").on(table.lastMessageAt.desc()),
  ]
);

// 5. messages
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
  ]
);

// 6. engagement_events
export const engagementEvents = pgTable(
  "engagement_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    thoughtId: uuid("thought_id")
      .notNull()
      .references(() => thoughts.id),
    eventType: engagementEventTypeEnum("event_type").notNull(),
    sessionId: text("session_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("engagement_events_user_thought_type_idx").on(
      table.userId,
      table.thoughtId,
      table.eventType
    ),
  ]
);

// 7. question_clusters (legacy name; currently used as resonance clusters)
export const questionClusters = pgTable("question_clusters", {
  id: uuid("id").primaryKey().defaultRandom(),
  centroidEmbedding: vector("centroid_embedding", { dimensions: VECTOR_DIMS }),
  label: text("label"),
  sampleQuestions: text("sample_questions").array(),
  thoughtCount: integer("thought_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 8. cross_cluster_affinity (populated later)
export const crossClusterAffinity = pgTable(
  "cross_cluster_affinity",
  {
    clusterAId: uuid("cluster_a_id")
      .notNull()
      .references(() => questionClusters.id),
    clusterBId: uuid("cluster_b_id")
      .notNull()
      .references(() => questionClusters.id),
    replyRate: real("reply_rate"),
    conversationRate: real("conversation_rate"),
    sustainRate: real("sustain_rate"),
    avgConversationDepth: real("avg_conversation_depth"),
  },
  (table) => [
    primaryKey({ columns: [table.clusterAId, table.clusterBId] }),
  ]
);

// 9. user_recommendation_weights (populated by learning loop)
export const userRecommendationWeights = pgTable(
  "user_recommendation_weights",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id),
    qWeight: real("q_weight").default(0.4),
    dWeight: real("d_weight").default(0.25),
    fWeight: real("f_weight").default(0.2),
    rWeight: real("r_weight").default(0.15),
    alpha: real("alpha").default(0.3),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  }
);

// 10. failed_processing_jobs (Phase 3 + 4 — embedding pipeline or image generation retry)
export const failedProcessingJobs = pgTable(
  "failed_processing_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    thoughtId: uuid("thought_id")
      .notNull()
      .references(() => thoughts.id),
    jobType: text("job_type").default("embedding"), // 'embedding' | 'image'
    error: text("error"),
    retryCount: integer("retry_count").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("failed_processing_jobs_thought_id_idx").on(table.thoughtId)]
);

// 11. image_generations (Phase 4 — daily cap per user)
export const imageGenerations = pgTable(
  "image_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    thoughtId: uuid("thought_id").references(() => thoughts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("image_generations_user_created_idx").on(table.userId, table.createdAt),
  ]
);

// 12. cross_domain_affinity (Phase 7 — concentration pairs, daily job)
export const crossDomainAffinity = pgTable(
  "cross_domain_affinity",
  {
    concentrationA: text("concentration_a").notNull(),
    concentrationB: text("concentration_b").notNull(),
    totalConversations: integer("total_conversations").notNull().default(0),
    sustainedConversations: integer("sustained_conversations").notNull().default(0),
    sustainRate: real("sustain_rate"),
    avgDepth: real("avg_depth"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.concentrationA, table.concentrationB] }),
  ]
);

// 13. system_config (Phase 7 — learned config, e.g. temporal resonance weights)
export const systemConfig = pgTable("system_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 14. learning_log (Phase 7 — job runs and details)
export const learningLog = pgTable("learning_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobType: text("job_type").notNull(), // 'daily' | 'weekly'
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  details: jsonb("details"),
});

// 15. learning_job_lock (Phase 7 — prevent concurrent runs)
export const learningJobLock = pgTable("learning_job_lock", {
  jobType: text("job_type").primaryKey(),
  lockedAt: timestamp("locked_at", { withTimezone: true }).notNull(),
  lockedBy: text("locked_by").notNull(),
});

// 16. crossing_drafts (Screen 7 — draft state per conversation)
export const crossingDrafts = pgTable("crossing_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  initiatorId: uuid("initiator_id")
    .notNull()
    .references(() => users.id),
  sentenceA: text("sentence_a"),
  sentenceB: text("sentence_b"),
  context: text("context"),
  status: crossingDraftStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 17. crossings (completed — on both profiles, never in feed)
export const crossings = pgTable("crossings", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  participantA: uuid("participant_a")
    .notNull()
    .references(() => users.id),
  participantB: uuid("participant_b")
    .notNull()
    .references(() => users.id),
  sentence: text("sentence").notNull(),
  context: text("context"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 17b. crossing_replies (replies to crossings, tagged to a participant)
export const crossingReplies = pgTable(
  "crossing_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    crossingId: uuid("crossing_id")
      .notNull()
      .references(() => crossings.id),
    replierId: uuid("replier_id")
      .notNull()
      .references(() => users.id),
    targetParticipantId: uuid("target_participant_id")
      .notNull()
      .references(() => users.id),
    text: text("text").notNull(),
    status: replyStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("crossing_replies_crossing_status_idx").on(table.crossingId, table.status),
  ]
);

// 18. shift_drafts (Screen 7 — before/after per person)
export const shiftDrafts = pgTable("shift_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  initiatorId: uuid("initiator_id")
    .notNull()
    .references(() => users.id),
  aBefore: text("a_before"),
  aAfter: text("a_after"),
  bBefore: text("b_before"),
  bAfter: text("b_after"),
  status: shiftDraftStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 19. shifts (completed — in both participants' feeds)
export const shifts = pgTable("shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  participantA: uuid("participant_a")
    .notNull()
    .references(() => users.id),
  participantB: uuid("participant_b")
    .notNull()
    .references(() => users.id),
  aBefore: text("a_before").notNull(),
  aAfter: text("a_after").notNull(),
  bBefore: text("b_before").notNull(),
  bAfter: text("b_after").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
