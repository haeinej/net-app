import { useCallback, useRef, useEffect } from "react";

interface EngagementTrackingOptions {
  thoughtId: string;
  visible: boolean;
}

/**
 * Tracks user engagement events for a thought card.
 * Currently records events locally; a future backend endpoint
 * will persist these for the recommendation learning loop.
 */
export function useEngagementTracking({ thoughtId, visible }: EngagementTrackingOptions) {
  const viewRecordedRef = useRef(false);

  useEffect(() => {
    if (visible && thoughtId && !viewRecordedRef.current) {
      viewRecordedRef.current = true;
      // Future: POST /api/engagement { thought_id, event_type: 'view_p1' }
    }
  }, [visible, thoughtId]);

  // Reset when thought changes
  useEffect(() => {
    viewRecordedRef.current = false;
  }, [thoughtId]);

  const recordViewP1 = useCallback(() => {
    // Future: POST /api/engagement { thought_id, event_type: 'view_p1' }
  }, []);

  const recordSwipeP2 = useCallback(() => {
    // Future: POST /api/engagement { thought_id, event_type: 'swipe_p2' }
  }, []);

  const recordSwipeP3 = useCallback(() => {
    // Future: POST /api/engagement { thought_id, event_type: 'swipe_p3' }
  }, []);

  const recordTypeStart = useCallback(() => {
    // Future: POST /api/engagement { thought_id, event_type: 'type_start' }
  }, []);

  const recordReplySent = useCallback((_meta?: Record<string, unknown>) => {
    // Future: POST /api/engagement { thought_id, event_type: 'reply_sent', metadata }
  }, []);

  return {
    recordViewP1,
    recordSwipeP2,
    recordSwipeP3,
    recordTypeStart,
    recordReplySent,
  };
}
