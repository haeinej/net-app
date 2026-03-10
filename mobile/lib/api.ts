const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export type WarmthLevel = "none" | "low" | "medium" | "full";

export interface FeedItemUser {
  id: string;
  name: string | null;
  photo_url: string | null;
}

export interface FeedItemThought {
  type: "thought";
  thought: {
    id: string;
    sentence: string;
    image_url: string | null;
    created_at: string;
    has_context: boolean;
  };
  user: FeedItemUser;
  warmth_level: WarmthLevel;
}

export interface FeedItemShift {
  type: "shift";
  id: string;
  created_at: string;
  participant_a: FeedItemUser & { before: string; after: string };
  participant_b: FeedItemUser & { before: string; after: string };
}

export type FeedItem = FeedItemThought | FeedItemShift;

export interface NotificationItem {
  reply_id: string;
  replier: { id: string; name: string | null; photo_url: string | null } | null;
  reply_preview: string;
  thought: { id: string; sentence: string } | null;
  created_at: string;
}

/** Mock fallback when no stored auth (e.g. dev). Set EXPO_PUBLIC_MOCK_AUTH_TOKEN to skip login. */
const MOCK_AUTH_TOKEN = process.env.EXPO_PUBLIC_MOCK_AUTH_TOKEN ?? null;

let cachedUserId: string | null = null;

export async function getStoredUserIdForApi(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  const { getStoredUserId } = await import("./auth-store");
  cachedUserId = await getStoredUserId();
  return cachedUserId;
}

export function setCachedUserId(id: string | null): void {
  cachedUserId = id;
}

/** Current user id for sent vs received; from auth store or EXPO_PUBLIC_MOCK_USER_ID. */
export async function getMyUserId(): Promise<string | null> {
  const stored = await getStoredUserIdForApi();
  if (stored) return stored;
  return process.env.EXPO_PUBLIC_MOCK_USER_ID ?? null;
}

async function getAuthToken(): Promise<string | null> {
  const { getStoredToken } = await import("./auth-store");
  const stored = await getStoredToken();
  if (stored) return stored;
  return MOCK_AUTH_TOKEN;
}

export async function fetchFeed(limit: number, offset: number): Promise<FeedItem[]> {
  const token = await getAuthToken();
  const res = await fetch(
    `${API_URL}/api/feed?limit=${limit}&offset=${offset}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok) throw new Error("Feed failed");
  return res.json();
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/notifications`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Notifications failed");
  return res.json();
}

export async function acceptReply(replyId: string): Promise<{ conversation_id: string }> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/replies/${replyId}/accept`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error("Accept failed");
  return res.json();
}

export async function deleteReply(replyId: string): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/replies/${replyId}/ignore`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Ignore failed");
}

export const ignoreReply = deleteReply;

// Thought detail (three panels)
export interface ThoughtPanel1 {
  sentence: string;
  image_url: string | null;
  user: { id: string; name: string | null; photo_url: string | null } | null;
  warmth_level: WarmthLevel;
  created_at: string | null;
}

export interface ThoughtPanel3Reply {
  id: string;
  user: { id: string; name: string | null; photo_url: string | null } | null;
  text: string;
  created_at: string | null;
}

export interface ThoughtDetailResponse {
  panel_1: ThoughtPanel1;
  panel_2: { sentence: string; context: string };
  panel_3: { accepted_replies: ThoughtPanel3Reply[]; can_reply: boolean };
}

export async function fetchThought(id: string): Promise<ThoughtDetailResponse> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/thoughts/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Thought not found");
  return res.json();
}

export async function postReply(thoughtId: string, text: string): Promise<{ id: string; status: string; created_at: string }> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/thoughts/${thoughtId}/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Reply failed");
  return res.json();
}

// Conversations
export interface ConversationListItem {
  id: string;
  other_user: { id: string; name: string | null; photo_url: string | null } | null;
  last_message_preview: string;
  last_message_at: string | null;
  is_dormant: boolean;
  unread: boolean;
}

export interface ConversationMessage {
  id: string;
  sender_id: string;
  text: string;
  created_at: string | null;
}

export async function fetchConversations(): Promise<ConversationListItem[]> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/conversations`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Conversations failed");
  return res.json();
}

export async function fetchConversationMessages(
  conversationId: string,
  limit = 50,
  beforeId?: string
): Promise<ConversationMessage[]> {
  const token = await getAuthToken();
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeId) params.set("before_id", beforeId);
  const res = await fetch(
    `${API_URL}/api/conversations/${conversationId}/messages?${params}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok) throw new Error("Messages failed");
  return res.json();
}

export async function postConversationMessage(
  conversationId: string,
  text: string
): Promise<{ id: string; text: string; created_at: string | null }> {
  const token = await getAuthToken();
  const res = await fetch(
    `${API_URL}/api/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text }),
    }
  );
  if (!res.ok) throw new Error("Send failed");
  return res.json();
}

// Conversation detail (message_count, crossing/shift state)
export interface CrossingDraft {
  id: string;
  initiator_id: string;
  initiator_name: string | null;
  sentence_a: string | null;
  sentence_b: string | null;
  context: string | null;
}

export interface ShiftDraft {
  id: string;
  initiator_id: string;
  initiator_name: string | null;
  a_before: string | null;
  a_after: string | null;
  b_before: string | null;
  b_after: string | null;
}

export interface ConversationDetail {
  id: string;
  message_count: number;
  participant_a_id: string;
  participant_b_id: string;
  crossing_draft: CrossingDraft | null;
  shift_draft: ShiftDraft | null;
  crossing_complete: boolean;
  shift_complete: boolean;
}

export async function fetchConversationDetail(conversationId: string): Promise<ConversationDetail> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/conversations/${conversationId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Conversation failed");
  return res.json();
}

// Crossing
export async function startCrossing(conversationId: string): Promise<CrossingDraft & { id: string }> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/conversations/${conversationId}/crossing/start`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Start crossing failed");
  return res.json();
}

export async function getCrossingDraft(conversationId: string): Promise<(CrossingDraft & { id: string }) | null> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/conversations/${conversationId}/crossing`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Get crossing failed");
  return res.json();
}

export async function updateCrossingDraft(
  conversationId: string,
  body: { sentence_a?: string; sentence_b?: string; context?: string }
): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/conversations/${conversationId}/crossing`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Update crossing failed");
}

export async function completeCrossing(
  conversationId: string,
  body: { sentence: string; context?: string }
): Promise<{ id: string; sentence: string; context: string | null; image_url: string | null }> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/conversations/${conversationId}/crossing/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Complete crossing failed");
  return res.json();
}

export async function abandonCrossing(conversationId: string): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/conversations/${conversationId}/crossing/abandon`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Abandon failed");
}

// Shift
export async function startShift(conversationId: string): Promise<ShiftDraft & { id: string }> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/conversations/${conversationId}/shift/start`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Start shift failed");
  return res.json();
}

export async function getShiftDraft(conversationId: string): Promise<(ShiftDraft & { id: string }) | null> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/conversations/${conversationId}/shift`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Get shift failed");
  return res.json();
}

export async function updateShiftDraft(
  conversationId: string,
  body: { a_before?: string; a_after?: string; b_before?: string; b_after?: string }
): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/conversations/${conversationId}/shift`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Update shift failed");
}

export async function completeShift(conversationId: string): Promise<{ id: string }> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/conversations/${conversationId}/shift/complete`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Complete shift failed");
  return res.json();
}

export async function abandonShift(conversationId: string): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/conversations/${conversationId}/shift/abandon`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Abandon failed");
}

// Profile
export interface ProfileThought {
  id: string;
  sentence: string;
  image_url: string | null;
  warmth_level: WarmthLevel;
  created_at: string | null;
}

export interface ProfileCrossing {
  id: string;
  sentence: string;
  context: string | null;
  image_url: string | null;
  created_at: string | null;
  participant_a: FeedItemUser | null;
  participant_b: FeedItemUser | null;
}

export interface ProfileResponse {
  id: string;
  name: string | null;
  photo_url: string | null;
  interests?: string[];
  thoughts: ProfileThought[];
  crossings?: ProfileCrossing[];
}

export async function fetchProfile(userId: string): Promise<ProfileResponse> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/users/${userId}/profile`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Profile failed");
  return res.json();
}

export interface UpdateProfileBody {
  name?: string;
  photo_url?: string;
  interests?: string[];
}

export async function updateProfile(
  body: UpdateProfileBody
): Promise<Pick<ProfileResponse, "id" | "name" | "photo_url" | "interests">> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/me/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Update failed");
  return res.json();
}

export async function deleteThought(thoughtId: string): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/thoughts/${thoughtId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Delete failed");
}

export interface CreateThoughtResponse {
  id: string;
  sentence: string;
  context: string;
  created_at: string | null;
}

export async function createThought(
  sentence: string,
  context?: string
): Promise<CreateThoughtResponse> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/thoughts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ sentence: sentence.trim(), context: (context ?? "").trim() || undefined }),
  });
  if (!res.ok) throw new Error("Post failed");
  return res.json();
}

// Auth (onboarding + login)
export interface RegisterBody {
  name: string;
  photo_url?: string;
  cohort_year: number;
  current_city: string;
  concentration: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user_id: string;
}

export async function register(body: RegisterBody): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Registration failed");
  return data as AuthResponse;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Login failed");
  return data as AuthResponse;
}
