import { randomUUID } from "node:crypto";
import { and, asc, gte, inArray } from "drizzle-orm";
import {
  crossings,
  crossingDrafts,
  db,
  feedServes,
  replies,
  conversations,
} from "../db";
import { feedConfig } from "./config";
import type { BucketLabel, FeedPhaseUsed, FeedServeTrace, UserStage } from "./types";

type FeedServeRow = typeof feedServes.$inferSelect;
type ReplyRow = typeof replies.$inferSelect;
type ConversationRow = typeof conversations.$inferSelect;
type CrossingDraftRow = typeof crossingDrafts.$inferSelect;
type CrossingRow = typeof crossings.$inferSelect;

type CounterBag = {
  impressions: number;
  qualifiedReplies: number;
  acceptedReplies: number;
  conversationStarts: number;
  conversationsDepth3: number;
  conversationsDepth10: number;
  eligibleConversations: number;
  crossingsStarted: number;
  crossingsApproved: number;
  crossingsAutoPosted: number;
  repeatAuthorPositions: number;
};

type ScoreAccumulator = {
  count: number;
  Q: number[];
  D: number[];
  F: number[];
  R: number[];
  finalRank: number[];
};

type GroupMetrics = ReturnType<typeof finalizeCounters>;

export type FeedMetricGroup = GroupMetrics;

export type PromotionCheck = {
  metric: string;
  direction: "higher_is_better" | "lower_is_better";
  baseline: number | null;
  candidate: number | null;
  delta: number | null;
  threshold: number;
  passed: boolean;
  blocker: boolean;
  note: string;
};

export type PromotionEvaluation = {
  generated_at: string;
  window_days: number;
  candidate_version: string;
  baseline_version: string;
  minimum_impressions: number;
  candidate: FeedMetricGroup | null;
  baseline: FeedMetricGroup | null;
  candidate_score: number | null;
  baseline_score: number | null;
  score_delta: number | null;
  checks: PromotionCheck[];
  blockers: string[];
  decision: "promote" | "hold";
  reason: string;
};

const DEFAULT_PROMOTION_MIN_IMPRESSIONS = 200;
const MIN_QUALIFIED_REPLY_DELTA = -0.005;
const MIN_DEPTH10_DELTA = -0.005;
const MIN_ACCEPT_DELTA = -0.01;
const MAX_AUTOPOST_DELTA = 0.02;
const MAX_REPEAT_AUTHOR_DELTA = 0.01;
const FEED_SERVE_FLUSH_BATCH_SIZE = 250;
const FEED_SERVE_FLUSH_DELAY_MS = 1000;

type PendingFeedServeInsert = typeof feedServes.$inferInsert;

let pendingFeedServeRows: PendingFeedServeInsert[] = [];
let feedServeFlushTimer: NodeJS.Timeout | null = null;
let feedServeFlushPromise: Promise<void> | null = null;

function numericMetric(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function weightedMetric(value: number | null, weight: number): number {
  return value == null ? 0 : value * weight;
}

function missionScore(metrics: FeedMetricGroup | null): number | null {
  if (!metrics) return null;
  const scored =
    weightedMetric(numericMetric(metrics.qualified_reply_rate), 0.32) +
    weightedMetric(numericMetric(metrics.reply_accept_rate), 0.13) +
    weightedMetric(numericMetric(metrics.conversation_depth_3_rate), 0.1) +
    weightedMetric(numericMetric(metrics.conversation_depth_10_rate), 0.24) +
    weightedMetric(numericMetric(metrics.crossing_approval_rate), 0.13) -
    weightedMetric(numericMetric(metrics.crossing_autopost_rate), 0.06) -
    weightedMetric(numericMetric(metrics.repeat_author_exposure_rate), 0.06);
  return Number.isFinite(scored) ? scored : null;
}

function buildHigherBetterCheck(
  metric: string,
  baseline: number | null,
  candidate: number | null,
  threshold: number,
  blocker: boolean,
  note: string
): PromotionCheck {
  if (baseline == null || candidate == null) {
    return {
      metric,
      direction: "higher_is_better",
      baseline,
      candidate,
      delta: null,
      threshold,
      passed: false,
      blocker,
      note: `${note}; insufficient data`,
    };
  }
  const delta = candidate - baseline;
  return {
    metric,
    direction: "higher_is_better",
    baseline,
    candidate,
    delta,
    threshold,
    passed: delta >= threshold,
    blocker,
    note,
  };
}

function buildLowerBetterCheck(
  metric: string,
  baseline: number | null,
  candidate: number | null,
  threshold: number,
  blocker: boolean,
  note: string
): PromotionCheck {
  if (baseline == null || candidate == null) {
    return {
      metric,
      direction: "lower_is_better",
      baseline,
      candidate,
      delta: null,
      threshold,
      passed: false,
      blocker,
      note: `${note}; insufficient data`,
    };
  }
  const delta = candidate - baseline;
  return {
    metric,
    direction: "lower_is_better",
    baseline,
    candidate,
    delta,
    threshold,
    passed: delta <= threshold,
    blocker,
    note,
  };
}

function emptyCounters(): CounterBag {
  return {
    impressions: 0,
    qualifiedReplies: 0,
    acceptedReplies: 0,
    conversationStarts: 0,
    conversationsDepth3: 0,
    conversationsDepth10: 0,
    eligibleConversations: 0,
    crossingsStarted: 0,
    crossingsApproved: 0,
    crossingsAutoPosted: 0,
    repeatAuthorPositions: 0,
  };
}

function emptyScoreAccumulator(): ScoreAccumulator {
  return {
    count: 0,
    Q: [],
    D: [],
    F: [],
    R: [],
    finalRank: [],
  };
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function summarizeNumberSeries(values: number[]) {
  if (values.length === 0) {
    return { avg: null, min: null, max: null };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    avg: total / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function finalizeCounters(counters: CounterBag) {
  return {
    impressions: counters.impressions,
    qualified_replies: counters.qualifiedReplies,
    accepted_replies: counters.acceptedReplies,
    conversation_starts: counters.conversationStarts,
    conversations_depth_3: counters.conversationsDepth3,
    conversations_depth_10: counters.conversationsDepth10,
    eligible_conversations: counters.eligibleConversations,
    crossings_started: counters.crossingsStarted,
    crossings_approved: counters.crossingsApproved,
    crossings_auto_posted: counters.crossingsAutoPosted,
    repeat_author_positions: counters.repeatAuthorPositions,
    qualified_reply_rate: rate(counters.qualifiedReplies, counters.impressions),
    reply_accept_rate: rate(counters.acceptedReplies, counters.qualifiedReplies),
    conversation_start_rate: rate(counters.conversationStarts, counters.impressions),
    conversation_depth_3_rate: rate(counters.conversationsDepth3, counters.conversationStarts),
    conversation_depth_10_rate: rate(counters.conversationsDepth10, counters.conversationStarts),
    crossing_start_rate: rate(counters.crossingsStarted, counters.eligibleConversations),
    crossing_approval_rate: rate(counters.crossingsApproved, counters.crossingsStarted),
    crossing_autopost_rate: rate(counters.crossingsAutoPosted, counters.crossingsStarted),
    repeat_author_exposure_rate: rate(counters.repeatAuthorPositions, counters.impressions),
  };
}

function finalizeScoreAccumulator(accumulator: ScoreAccumulator) {
  return {
    samples: accumulator.count,
    Q: summarizeNumberSeries(accumulator.Q),
    D: summarizeNumberSeries(accumulator.D),
    F: summarizeNumberSeries(accumulator.F),
    R: summarizeNumberSeries(accumulator.R),
    final_rank: summarizeNumberSeries(accumulator.finalRank),
  };
}

function toMillis(value: Date | null): number {
  if (!value) return 0;
  return value.getTime();
}

function timelineKey(viewerId: string, thoughtId: string): string {
  return `${viewerId}\u0000${thoughtId}`;
}

function recordScore(accumulator: ScoreAccumulator, serve: FeedServeRow) {
  accumulator.count += 1;
  if (typeof serve.scoreQ === "number") accumulator.Q.push(serve.scoreQ);
  if (typeof serve.scoreD === "number") accumulator.D.push(serve.scoreD);
  if (typeof serve.scoreF === "number") accumulator.F.push(serve.scoreF);
  if (typeof serve.scoreR === "number") accumulator.R.push(serve.scoreR);
  if (typeof serve.finalRank === "number") accumulator.finalRank.push(serve.finalRank);
}

function findLatestServeBefore(
  timeline: FeedServeRow[],
  createdAt: Date | null
): FeedServeRow | null {
  const createdAtMs = toMillis(createdAt);
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const serve = timeline[index];
    if (serve && toMillis(serve.servedAt) <= createdAtMs) {
      return serve;
    }
  }
  return null;
}

function touchGroupCounter(
  map: Map<string, CounterBag>,
  key: string
): CounterBag {
  const current = map.get(key);
  if (current) return current;
  const created = emptyCounters();
  map.set(key, created);
  return created;
}

function touchScoreAccumulator(
  map: Map<string, ScoreAccumulator>,
  key: string
): ScoreAccumulator {
  const current = map.get(key);
  if (current) return current;
  const created = emptyScoreAccumulator();
  map.set(key, created);
  return created;
}

function applyToServeGroups(
  serve: FeedServeRow,
  overall: CounterBag,
  byBucket: Map<string, CounterBag>,
  byStage: Map<string, CounterBag>,
  byPhase: Map<string, CounterBag>,
  mutate: (group: CounterBag) => void
) {
  mutate(overall);
  if (serve.bucket) mutate(touchGroupCounter(byBucket, serve.bucket));
  if (serve.stage) mutate(touchGroupCounter(byStage, serve.stage));
  if (serve.phaseUsed) mutate(touchGroupCounter(byPhase, serve.phaseUsed));
}

function toObject<T>(
  map: Map<string, T>
): Record<string, T> {
  return Object.fromEntries([...map.entries()]);
}

export async function recordFeedServe(
  viewerId: string,
  traces: FeedServeTrace[],
  configVersion: string
): Promise<void> {
  if (traces.length === 0) return;
  const requestId = randomUUID();
  const servedAt = new Date();
  pendingFeedServeRows.push(
    ...traces.map((trace) => ({
      requestId,
      viewerId,
      itemType: trace.item_type,
      thoughtId: trace.thought_id,
      crossingId: trace.crossing_id,
      authorId: trace.author_id,
      position: trace.position,
      bucket: trace.bucket,
      stage: trace.stage,
      phaseUsed: trace.phase_used,
      scoreQ: trace.scores.Q,
      scoreD: trace.scores.D,
      scoreF: trace.scores.F,
      scoreR: trace.scores.R,
      finalRank: trace.scores.final_rank,
      resonanceSimilarity: trace.resonance_similarity,
      surfaceSimilarity: trace.surface_similarity,
      configVersion,
      servedAt,
    }))
  );

  if (pendingFeedServeRows.length >= FEED_SERVE_FLUSH_BATCH_SIZE) {
    void flushPendingFeedServes();
    return;
  }

  if (!feedServeFlushTimer) {
    feedServeFlushTimer = setTimeout(() => {
      feedServeFlushTimer = null;
      void flushPendingFeedServes();
    }, FEED_SERVE_FLUSH_DELAY_MS);
  }
}

async function flushPendingFeedServes(): Promise<void> {
  if (feedServeFlushPromise) {
    return feedServeFlushPromise;
  }
  if (pendingFeedServeRows.length === 0) {
    return;
  }

  if (feedServeFlushTimer) {
    clearTimeout(feedServeFlushTimer);
    feedServeFlushTimer = null;
  }

  const rows = pendingFeedServeRows;
  pendingFeedServeRows = [];

  feedServeFlushPromise = db
    .insert(feedServes)
    .values(rows)
    .then(() => undefined)
    .catch((error) => {
      console.error("feed serve batch insert failed", {
        count: rows.length,
        message: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      feedServeFlushPromise = null;
      if (pendingFeedServeRows.length > 0) {
        void flushPendingFeedServes();
      }
    });

  await feedServeFlushPromise;
}

export async function getFeedMetrics(days: number = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const serveRows = await db
    .select()
    .from(feedServes)
    .where(gte(feedServes.servedAt, cutoff))
    .orderBy(asc(feedServes.servedAt), asc(feedServes.position));

  const thoughtServeRows = serveRows.filter(
    (row) => row.itemType === "thought" && row.thoughtId
  );

  const overallCounters = emptyCounters();
  const byBucketCounters = new Map<string, CounterBag>();
  const byStageCounters = new Map<string, CounterBag>();
  const byPhaseCounters = new Map<string, CounterBag>();
  const byConfigVersionCounters = new Map<string, CounterBag>();
  const overallScores = emptyScoreAccumulator();
  const bucketScores = new Map<string, ScoreAccumulator>();

  const composition = {
    thought: serveRows.filter((row) => row.itemType === "thought").length,
    crossing: serveRows.filter((row) => row.itemType === "crossing").length,
  };

  const timelineByViewerThought = new Map<string, FeedServeRow[]>();
  const servesByRequest = new Map<string, FeedServeRow[]>();

  for (const serve of thoughtServeRows) {
    const key = timelineKey(serve.viewerId, serve.thoughtId!);
    const timeline = timelineByViewerThought.get(key) ?? [];
    timeline.push(serve);
    timelineByViewerThought.set(key, timeline);

    const requestServes = servesByRequest.get(serve.requestId) ?? [];
    requestServes.push(serve);
    servesByRequest.set(serve.requestId, requestServes);

    applyToServeGroups(
      serve,
      overallCounters,
      byBucketCounters,
      byStageCounters,
      byPhaseCounters,
      (group) => {
        group.impressions += 1;
      }
    );
    const configCounters =
      byConfigVersionCounters.get(serve.configVersion) ?? emptyCounters();
    configCounters.impressions += 1;
    byConfigVersionCounters.set(serve.configVersion, configCounters);

    recordScore(overallScores, serve);
    if (serve.bucket) {
      recordScore(touchScoreAccumulator(bucketScores, serve.bucket), serve);
    }
  }

  for (const requestRows of servesByRequest.values()) {
    requestRows.sort((a, b) => a.position - b.position);
    const recentAuthors: Array<string | null> = [];
    for (const serve of requestRows) {
      const isRepeat =
        serve.authorId != null && recentAuthors.slice(-10).includes(serve.authorId);
      if (isRepeat) {
        applyToServeGroups(
          serve,
          overallCounters,
          byBucketCounters,
          byStageCounters,
          byPhaseCounters,
          (group) => {
            group.repeatAuthorPositions += 1;
          }
        );
        const configCounters =
          byConfigVersionCounters.get(serve.configVersion) ?? emptyCounters();
        configCounters.repeatAuthorPositions += 1;
        byConfigVersionCounters.set(serve.configVersion, configCounters);
      }
      recentAuthors.push(serve.authorId ?? null);
    }
  }

  if (thoughtServeRows.length === 0) {
    return {
      generated_at: new Date().toISOString(),
      window_start: cutoff.toISOString(),
      window_days: days,
      config: {
        version: feedConfig.version,
        phase1_viewer_thought_threshold: feedConfig.phase1ViewerThoughtThreshold,
        phase1_system_engagement_threshold: feedConfig.phase1SystemEngagementThreshold,
        bucket_ratios: feedConfig.bucketRatios,
      },
      composition,
      overall: finalizeCounters(overallCounters),
      by_bucket: {},
      by_stage: {},
      by_phase: {},
      score_summary: {
        overall: finalizeScoreAccumulator(overallScores),
        by_bucket: {},
      },
    };
  }

  const thoughtIds = [...new Set(thoughtServeRows.map((row) => row.thoughtId!).filter(Boolean))];
  const replyRows: ReplyRow[] = thoughtIds.length
    ? await db
        .select()
        .from(replies)
        .where(and(inArray(replies.thoughtId, thoughtIds), gte(replies.createdAt, cutoff)))
    : [];

  const acceptedReplyIds = replyRows
    .filter((row) => row.status === "accepted")
    .map((row) => row.id);
  const conversationRows: ConversationRow[] = acceptedReplyIds.length
    ? await db
        .select()
        .from(conversations)
        .where(inArray(conversations.replyId, acceptedReplyIds))
    : [];
  const conversationsByReplyId = new Map(
    conversationRows.map((conversation) => [conversation.replyId, conversation])
  );

  const conversationIds = conversationRows.map((conversation) => conversation.id);
  const crossingDraftRows: CrossingDraftRow[] = conversationIds.length
    ? await db
        .select()
        .from(crossingDrafts)
        .where(inArray(crossingDrafts.conversationId, conversationIds))
    : [];
  const crossingRows: CrossingRow[] = conversationIds.length
    ? await db
        .select()
        .from(crossings)
        .where(inArray(crossings.conversationId, conversationIds))
    : [];

  const draftSummaryByConversation = new Map<
    string,
    { started: boolean; autoPosted: boolean }
  >();
  for (const draft of crossingDraftRows) {
    const current = draftSummaryByConversation.get(draft.conversationId) ?? {
      started: false,
      autoPosted: false,
    };
    current.started = true;
    if (draft.status === "auto_posted") {
      current.autoPosted = true;
    }
    draftSummaryByConversation.set(draft.conversationId, current);
  }
  const approvedConversationIds = new Set(
    crossingRows.map((crossing) => crossing.conversationId)
  );

  for (const reply of replyRows) {
    const timeline = timelineByViewerThought.get(
      timelineKey(reply.replierId, reply.thoughtId)
    );
    if (!timeline || timeline.length === 0) continue;
    const serve = findLatestServeBefore(timeline, reply.createdAt);
    if (!serve) continue;

    applyToServeGroups(
      serve,
      overallCounters,
      byBucketCounters,
      byStageCounters,
      byPhaseCounters,
      (group) => {
        group.qualifiedReplies += 1;
      }
    );
    const configCounters =
      byConfigVersionCounters.get(serve.configVersion) ?? emptyCounters();
    configCounters.qualifiedReplies += 1;
    byConfigVersionCounters.set(serve.configVersion, configCounters);

    if (reply.status !== "accepted") continue;

    const conversation = conversationsByReplyId.get(reply.id);
    applyToServeGroups(
      serve,
      overallCounters,
      byBucketCounters,
      byStageCounters,
      byPhaseCounters,
      (group) => {
        group.acceptedReplies += 1;
        if (conversation) {
          group.conversationStarts += 1;
          if ((conversation.messageCount ?? 0) >= 3) {
            group.conversationsDepth3 += 1;
          }
          if ((conversation.messageCount ?? 0) >= 10) {
            group.conversationsDepth10 += 1;
            group.eligibleConversations += 1;
          }
        }
      }
    );
    {
      const configCounter =
        byConfigVersionCounters.get(serve.configVersion) ?? emptyCounters();
      configCounter.acceptedReplies += 1;
      if (conversation) {
        configCounter.conversationStarts += 1;
        if ((conversation.messageCount ?? 0) >= 3) {
          configCounter.conversationsDepth3 += 1;
        }
        if ((conversation.messageCount ?? 0) >= 10) {
          configCounter.conversationsDepth10 += 1;
          configCounter.eligibleConversations += 1;
        }
      }
      byConfigVersionCounters.set(serve.configVersion, configCounter);
    }

    if (!conversation) continue;
    const draftSummary = draftSummaryByConversation.get(conversation.id);
    const crossingApproved = approvedConversationIds.has(conversation.id);
    const crossingStarted = Boolean(draftSummary?.started) || crossingApproved;
    const crossingAutoPosted = Boolean(draftSummary?.autoPosted);

    if (!crossingStarted && !crossingApproved && !crossingAutoPosted) continue;

    applyToServeGroups(
      serve,
      overallCounters,
      byBucketCounters,
      byStageCounters,
      byPhaseCounters,
      (group) => {
        if (crossingStarted) {
          group.crossingsStarted += 1;
        }
        if (crossingApproved) {
          group.crossingsApproved += 1;
        }
        if (crossingAutoPosted) {
          group.crossingsAutoPosted += 1;
        }
      }
    );
    {
      const configCounter =
        byConfigVersionCounters.get(serve.configVersion) ?? emptyCounters();
      if (crossingStarted) {
        configCounter.crossingsStarted += 1;
      }
      if (crossingApproved) {
        configCounter.crossingsApproved += 1;
      }
      if (crossingAutoPosted) {
        configCounter.crossingsAutoPosted += 1;
      }
      byConfigVersionCounters.set(serve.configVersion, configCounter);
    }
  }

  return {
    generated_at: new Date().toISOString(),
    window_start: cutoff.toISOString(),
    window_days: days,
    config: {
      version: feedConfig.version,
      phase1_viewer_thought_threshold: feedConfig.phase1ViewerThoughtThreshold,
      phase1_system_engagement_threshold: feedConfig.phase1SystemEngagementThreshold,
      bucket_ratios: feedConfig.bucketRatios,
    },
    composition,
    overall: finalizeCounters(overallCounters),
    by_bucket: toObject(
      new Map(
        [...byBucketCounters.entries()].map(([key, value]) => [key, finalizeCounters(value)])
      )
    ) as Record<BucketLabel, GroupMetrics>,
    by_stage: toObject(
      new Map(
        [...byStageCounters.entries()].map(([key, value]) => [key, finalizeCounters(value)])
      )
    ) as Record<UserStage, GroupMetrics>,
    by_phase: toObject(
      new Map(
        [...byPhaseCounters.entries()].map(([key, value]) => [key, finalizeCounters(value)])
      )
    ) as Record<FeedPhaseUsed, GroupMetrics>,
    by_config_version: toObject(
      new Map(
        [...byConfigVersionCounters.entries()].map(([key, value]) => [
          key,
          finalizeCounters(value),
        ])
      )
    ) as Record<string, GroupMetrics>,
    score_summary: {
      overall: finalizeScoreAccumulator(overallScores),
      by_bucket: toObject(
        new Map(
          [...bucketScores.entries()].map(([key, value]) => [key, finalizeScoreAccumulator(value)])
        )
      ) as Record<BucketLabel, ReturnType<typeof finalizeScoreAccumulator>>,
    },
  };
}

export async function evaluateRankingPromotion(input: {
  candidateVersion: string;
  baselineVersion: string;
  days?: number;
  minimumImpressions?: number;
}): Promise<PromotionEvaluation> {
  const days = Math.min(30, Math.max(1, input.days ?? 7));
  const minimumImpressions = Math.max(
    25,
    Math.min(5000, input.minimumImpressions ?? DEFAULT_PROMOTION_MIN_IMPRESSIONS)
  );
  const metrics = await getFeedMetrics(days);
  const byConfigVersion = metrics.by_config_version ?? {};
  const candidate = byConfigVersion[input.candidateVersion] ?? null;
  const baseline = byConfigVersion[input.baselineVersion] ?? null;

  const blockers: string[] = [];
  const checks: PromotionCheck[] = [];

  if (!candidate) {
    blockers.push(`Candidate config ${input.candidateVersion} has no recorded serves in the selected window.`);
  }
  if (!baseline) {
    blockers.push(`Baseline config ${input.baselineVersion} has no recorded serves in the selected window.`);
  }

  if ((candidate?.impressions ?? 0) < minimumImpressions) {
    blockers.push(
      `Candidate config needs at least ${minimumImpressions} impressions before promotion.`
    );
  }
  if ((baseline?.impressions ?? 0) < minimumImpressions) {
    blockers.push(
      `Baseline config needs at least ${minimumImpressions} impressions for a fair comparison.`
    );
  }

  checks.push(
    buildHigherBetterCheck(
      "qualified_reply_rate",
      numericMetric(baseline?.qualified_reply_rate),
      numericMetric(candidate?.qualified_reply_rate),
      MIN_QUALIFIED_REPLY_DELTA,
      true,
      "Candidate must not materially reduce thoughtful replies."
    ),
    buildHigherBetterCheck(
      "conversation_depth_10_rate",
      numericMetric(baseline?.conversation_depth_10_rate),
      numericMetric(candidate?.conversation_depth_10_rate),
      MIN_DEPTH10_DELTA,
      true,
      "Candidate must preserve deep conversation creation."
    ),
    buildHigherBetterCheck(
      "reply_accept_rate",
      numericMetric(baseline?.reply_accept_rate),
      numericMetric(candidate?.reply_accept_rate),
      MIN_ACCEPT_DELTA,
      false,
      "Reply acceptance should stay healthy."
    ),
    buildHigherBetterCheck(
      "crossing_approval_rate",
      numericMetric(baseline?.crossing_approval_rate),
      numericMetric(candidate?.crossing_approval_rate),
      MIN_ACCEPT_DELTA,
      false,
      "Mutual crossings should not trend down."
    ),
    buildLowerBetterCheck(
      "crossing_autopost_rate",
      numericMetric(baseline?.crossing_autopost_rate),
      numericMetric(candidate?.crossing_autopost_rate),
      MAX_AUTOPOST_DELTA,
      true,
      "Autoposted crossings should not rise materially."
    ),
    buildLowerBetterCheck(
      "repeat_author_exposure_rate",
      numericMetric(baseline?.repeat_author_exposure_rate),
      numericMetric(candidate?.repeat_author_exposure_rate),
      MAX_REPEAT_AUTHOR_DELTA,
      true,
      "Repeat author exposure should stay controlled."
    )
  );

  const candidateScore = missionScore(candidate);
  const baselineScore = missionScore(baseline);
  const scoreDelta =
    candidateScore != null && baselineScore != null ? candidateScore - baselineScore : null;

  if (scoreDelta == null) {
    blockers.push("Mission score could not be computed from the current metrics window.");
  } else if (scoreDelta < 0) {
    blockers.push("Candidate mission score is worse than the active baseline.");
  }

  for (const check of checks) {
    if (check.blocker && !check.passed) {
      blockers.push(`${check.metric} failed: ${check.note}`);
    }
  }

  const decision = blockers.length === 0 ? "promote" : "hold";
  const reason =
    decision === "promote"
      ? "Candidate clears the current mission-aligned guardrails."
      : blockers[0] ?? "Candidate did not pass the promotion guard.";

  return {
    generated_at: new Date().toISOString(),
    window_days: days,
    candidate_version: input.candidateVersion,
    baseline_version: input.baselineVersion,
    minimum_impressions: minimumImpressions,
    candidate,
    baseline,
    candidate_score: candidateScore,
    baseline_score: baselineScore,
    score_delta: scoreDelta,
    checks,
    blockers,
    decision,
    reason,
  };
}
