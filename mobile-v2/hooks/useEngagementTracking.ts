import { useCallback, useRef, useEffect } from "react";
import * as api from "../lib/api";

interface EngagementTrackingOptions {
  thoughtId: string;
  visible: boolean;
}

interface EngagementEvent {
  event_type: string;
  thought_id: string;
  session_id: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// ── Shared session + batching ──────────────────────────
let sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let eventQueue: EngagementEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH_SIZE = 20;

function resetSession() {
  sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function flushQueue() {
  if (eventQueue.length === 0) return;
  const batch = eventQueue.splice(0, MAX_BATCH_SIZE);
  try {
    await api.trackEngagement(batch);
  } catch {
    // Fire-and-forget: don't block the UI for analytics
  }
}

function enqueue(event: Omit<EngagementEvent, "session_id" | "timestamp">) {
  eventQueue.push({
    ...event,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
  });

  if (eventQueue.length >= MAX_BATCH_SIZE) {
    flushQueue();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushQueue();
    }, FLUSH_INTERVAL_MS);
  }
}

/**
 * Tracks user engagement events for a thought card.
 * Batches events and flushes every 5s or at 20 events.
 */
export function useEngagementTracking({ thoughtId, visible }: EngagementTrackingOptions) {
  const viewRecordedRef = useRef(false);

  useEffect(() => {
    if (visible && thoughtId && !viewRecordedRef.current) {
      viewRecordedRef.current = true;
      enqueue({ event_type: "view_p1", thought_id: thoughtId });
    }
  }, [visible, thoughtId]);

  // Reset when thought changes
  useEffect(() => {
    viewRecordedRef.current = false;
  }, [thoughtId]);

  const recordSwipeP2 = useCallback(() => {
    enqueue({ event_type: "swipe_p2", thought_id: thoughtId });
  }, [thoughtId]);

  const recordSwipeP3 = useCallback(() => {
    enqueue({ event_type: "swipe_p3", thought_id: thoughtId });
  }, [thoughtId]);

  const recordTypeStart = useCallback(() => {
    enqueue({ event_type: "type_start", thought_id: thoughtId });
  }, [thoughtId]);

  const recordReplySent = useCallback((meta?: Record<string, unknown>) => {
    enqueue({ event_type: "reply_sent", thought_id: thoughtId, metadata: meta });
  }, [thoughtId]);

  return {
    recordSwipeP2,
    recordSwipeP3,
    recordTypeStart,
    recordReplySent,
  };
}

export { resetSession, flushQueue };
