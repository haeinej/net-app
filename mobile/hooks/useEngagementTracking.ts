/**
 * Phase 6: engagement tracking hook. Buffers events, flushes every 5s / 20 events / app background.
 * Call recordViewP1() when the thought card has been visible for >1s (e.g. from parent timer or Intersection Observer on web).
 */

import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 20;
const SESSION_INACTIVITY_MS = 30 * 60 * 1000;

export type EngagementEventType =
  | "view_p1"
  | "swipe_p2"
  | "swipe_p3"
  | "type_start"
  | "reply_sent";

export interface EngagementEventPayload {
  event_type: EngagementEventType;
  thought_id: string;
  session_id: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface UseEngagementTrackingOptions {
  thoughtId: string;
  /** When true for >1s, records view_p1 once. Set from parent (e.g. Intersection Observer on web, or onViewableItemsChanged on RN). */
  visible?: boolean;
  apiUrl?: string;
  getToken?: () => Promise<string | null>;
}

export interface UseEngagementTrackingReturn {
  recordViewP1: () => void;
  recordSwipeP2: () => void;
  recordSwipeP3: () => void;
  recordTypeStart: () => void;
  recordReplySent: (metadata: { reply_length_chars: number }) => void;
}

const VIEW_P1_DELAY_MS = 1000;

export function useEngagementTracking({
  thoughtId,
  visible = false,
  apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
  getToken,
}: UseEngagementTrackingOptions): UseEngagementTrackingReturn {
  const bufferRef = useRef<EngagementEventPayload[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string>(uuid());
  const lastActivityRef = useRef<number>(Date.now());
  const typeStartFiredRef = useRef<boolean>(false);
  const viewP1FiredRef = useRef<boolean>(false);
  const viewP1TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getSessionId = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityRef.current > SESSION_INACTIVITY_MS) {
      sessionIdRef.current = uuid();
    }
    lastActivityRef.current = now;
    return sessionIdRef.current;
  }, []);

  const flush = useCallback(async () => {
    const events = bufferRef.current;
    if (events.length === 0) return;
    bufferRef.current = [];
    const token = getToken ? await getToken() : null;
    try {
      await fetch(`${apiUrl.replace(/\/$/, "")}/api/engagement/track`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ events }),
      });
    } catch {
      bufferRef.current = events.concat(bufferRef.current);
    }
  }, [apiUrl, getToken]);

  const push = useCallback(
    (event_type: EngagementEventType, metadata?: Record<string, unknown>) => {
      getSessionId();
      bufferRef.current.push({
        event_type,
        thought_id: thoughtId,
        session_id: sessionIdRef.current,
        ...(metadata && { metadata }),
        timestamp: new Date().toISOString(),
      });
      if (bufferRef.current.length >= MAX_BUFFER_SIZE) {
        flush();
      }
    },
    [thoughtId, getSessionId, flush]
  );

  useEffect(() => {
    flushTimerRef.current = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, [flush]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background") flush();
    });
    return () => sub.remove();
  }, [flush]);

  const recordViewP1 = useCallback(() => push("view_p1"), [push]);
  const recordSwipeP2 = useCallback(() => push("swipe_p2"), [push]);
  const recordSwipeP3 = useCallback(() => push("swipe_p3"), [push]);
  const recordTypeStart = useCallback(() => {
    if (typeStartFiredRef.current) return;
    typeStartFiredRef.current = true;
    push("type_start");
  }, [push]);
  const recordReplySent = useCallback(
    (metadata: { reply_length_chars: number }) => push("reply_sent", metadata),
    [push]
  );

  useEffect(() => {
    typeStartFiredRef.current = false;
  }, [thoughtId]);

  useEffect(() => {
    if (!visible) {
      if (viewP1TimerRef.current) {
        clearTimeout(viewP1TimerRef.current);
        viewP1TimerRef.current = null;
      }
      return;
    }
    if (viewP1FiredRef.current) return;
    viewP1TimerRef.current = setTimeout(() => {
      viewP1FiredRef.current = true;
      viewP1TimerRef.current = null;
      push("view_p1");
    }, VIEW_P1_DELAY_MS);
    return () => {
      if (viewP1TimerRef.current) clearTimeout(viewP1TimerRef.current);
    };
  }, [visible, thoughtId, push]);

  useEffect(() => {
    viewP1FiredRef.current = false;
  }, [thoughtId]);

  return {
    recordViewP1,
    recordSwipeP2,
    recordSwipeP3,
    recordTypeStart,
    recordReplySent,
  };
}
