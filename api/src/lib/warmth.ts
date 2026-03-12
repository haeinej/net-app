import type { WarmthLevel } from "../types";

export function getWarmthLevel(acceptedReplyCount: number): WarmthLevel {
  if (acceptedReplyCount <= 0) return "none";
  if (acceptedReplyCount === 1) return "low";
  return "medium";
}
