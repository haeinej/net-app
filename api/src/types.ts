// Core domain types for ohm.

export type WarmthLevel = "none" | "low" | "medium" | "full";

export interface User {
  id: string;
  display_name: string;
  profile_photo_url: string | null;
  interests: string; // internal cold-start signal, never a taxonomy
  cohort: string;
  city: string;
  concentration: string;
  created_at: Date;
}

export interface ResonanceSignature {
  tensions: Array<{ description: string; weight: number }>;
  domains: string[];
  openness: number;
  abstraction: number;
  resonance_phrases: string[];
}

export interface Thought {
  id: string;
  user_id: string;
  sentence: string;           // the single sentence — the thought itself
  context: string | null;     // up to 3 sentences of background
  photo_url: string | null;   // user-selected photo source for the client mesh overlay
  image_url: string | null;   // deprecated legacy generated image URL
  quality_score: number;      // currently openness-weighted
  resonance_signature?: ResonanceSignature;
  created_at: Date;
}

export interface FeedThought extends Thought {
  warmth_level: WarmthLevel;
  // NOTE: never include counts of any kind
}

export interface Reply {
  id: string;
  thought_id: string;
  from_user_id: string;
  content: string;
  accepted: boolean;
  created_at: Date;
}

export interface Conversation {
  id: string;
  thought_id: string;
  participant_a: string;
  participant_b: string;
  started_at: Date;
  last_message_at: Date;
  message_count: number;
}

// Engagement events (internal only, never exposed to users)
export type EngagementEventType =
  | "view_p1"
  | "swipe_p2"
  | "swipe_p3"
  | "type_start"
  | "reply_sent";

export interface EngagementEvent {
  id: string;
  user_id: string;
  thought_id: string;
  event_type: EngagementEventType;
  created_at: Date;
}
