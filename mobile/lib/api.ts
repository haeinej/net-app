import {
  API_URL,
  getApiReachabilityMessage,
  getApiTimeoutMessage,
} from "./api-config";

const AUTH_REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_REQUEST_TIMEOUT_MS = 12000;
const JSON_HEADERS = { "Content-Type": "application/json" } as const;

interface ApiRequestOptions extends Omit<RequestInit, "headers"> {
  auth?: boolean;
  headers?: HeadersInit;
  timeoutMs?: number;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function isSessionInvalidError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 404);
}

function buildApiUrl(path: string): string {
  return `${API_URL}${path}`;
}

function getErrorMessage(
  data: unknown,
  fallbackMessage: string
): string {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string" &&
    data.error.trim()
  ) {
    return data.error;
  }

  return fallbackMessage;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function requestApi(
  path: string,
  { auth = false, headers, timeoutMs, ...init }: ApiRequestOptions = {}
): Promise<Response> {
  const effectiveTimeoutMs = timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  const token = auth ? await getAuthToken() : null;
  const requestHeaders = new Headers(headers);
  if (token) requestHeaders.set("Authorization", `Bearer ${token}`);

  try {
    return await fetch(buildApiUrl(path), {
      ...init,
      headers: requestHeaders,
      signal: init.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(getApiTimeoutMessage(effectiveTimeoutMs));
    }

    if (error instanceof TypeError) {
      throw new Error(getApiReachabilityMessage());
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestJson<T>(
  path: string,
  fallbackMessage: string,
  options?: ApiRequestOptions & { allow404?: false }
): Promise<T>;
async function requestJson<T>(
  path: string,
  fallbackMessage: string,
  options: ApiRequestOptions & { allow404: true }
): Promise<T | null>;
async function requestJson<T>(
  path: string,
  fallbackMessage: string,
  { allow404 = false, ...options }: ApiRequestOptions & { allow404?: boolean } = {}
): Promise<T | null> {
  const response = await requestApi(path, options);
  if (allow404 && response.status === 404) return null;

  const data = await readJson<T | { error?: string }>(response);
  if (!response.ok) {
    throw new ApiError(response.status, getErrorMessage(data, fallbackMessage));
  }

  return data as T;
}

async function requestVoid(
  path: string,
  fallbackMessage: string,
  options: ApiRequestOptions = {}
): Promise<void> {
  const response = await requestApi(path, options);
  const data = await readJson<{ error?: string }>(response);
  if (!response.ok) {
    throw new ApiError(response.status, getErrorMessage(data, fallbackMessage));
  }
}

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
    photo_url: string | null;
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

/** Current user id for sent vs received; from auth store. */
export async function getMyUserId(): Promise<string | null> {
  return getStoredUserIdForApi();
}

async function getAuthToken(): Promise<string | null> {
  const { getStoredToken } = await import("./auth-store");
  return getStoredToken();
}

export async function fetchFeed(limit: number, offset: number): Promise<FeedItem[]> {
  return requestJson<FeedItem[]>(
    `/api/feed?limit=${limit}&offset=${offset}`,
    "Feed failed",
    { auth: true }
  );
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  return requestJson<NotificationItem[]>("/api/notifications", "Notifications failed", {
    auth: true,
  });
}

export async function acceptReply(replyId: string): Promise<{ conversation_id: string }> {
  return requestJson<{ conversation_id: string }>(
    `/api/replies/${replyId}/accept`,
    "Accept failed",
    { method: "POST", auth: true }
  );
}

export async function deleteReply(replyId: string): Promise<void> {
  await requestVoid(`/api/replies/${replyId}/ignore`, "Ignore failed", {
    method: "POST",
    auth: true,
  });
}

export const ignoreReply = deleteReply;

// Thought detail (three panels)
export interface ThoughtPanel1 {
  sentence: string;
  photo_url: string | null;
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
  return requestJson<ThoughtDetailResponse>(`/api/thoughts/${id}`, "Thought not found", {
    auth: true,
  });
}

export async function postReply(thoughtId: string, text: string): Promise<{ id: string; status: string; created_at: string }> {
  return requestJson<{ id: string; status: string; created_at: string }>(
    `/api/thoughts/${thoughtId}/reply`,
    "Reply failed",
    {
      method: "POST",
      auth: true,
      headers: JSON_HEADERS,
      body: JSON.stringify({ text }),
    }
  );
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
  return requestJson<ConversationListItem[]>("/api/conversations", "Conversations failed", {
    auth: true,
  });
}

export async function fetchConversationMessages(
  conversationId: string,
  limit = 50,
  beforeId?: string
): Promise<ConversationMessage[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeId) params.set("before_id", beforeId);
  return requestJson<ConversationMessage[]>(
    `/api/conversations/${conversationId}/messages?${params}`,
    "Messages failed",
    { auth: true }
  );
}

export async function postConversationMessage(
  conversationId: string,
  text: string
): Promise<{ id: string; text: string; created_at: string | null }> {
  return requestJson<{ id: string; text: string; created_at: string | null }>(
    `/api/conversations/${conversationId}/messages`,
    "Send failed",
    {
      method: "POST",
      auth: true,
      headers: JSON_HEADERS,
      body: JSON.stringify({ text }),
    }
  );
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
  return requestJson<ConversationDetail>(
    `/api/conversations/${conversationId}`,
    "Conversation failed",
    { auth: true }
  );
}

// Crossing
export async function startCrossing(conversationId: string): Promise<CrossingDraft & { id: string }> {
  return requestJson<CrossingDraft & { id: string }>(
    `/api/conversations/${conversationId}/crossing/start`,
    "Start crossing failed",
    { method: "POST", auth: true }
  );
}

export async function getCrossingDraft(conversationId: string): Promise<(CrossingDraft & { id: string }) | null> {
  return requestJson<CrossingDraft & { id: string }>(
    `/api/conversations/${conversationId}/crossing`,
    "Get crossing failed",
    { auth: true, allow404: true }
  );
}

export async function updateCrossingDraft(
  conversationId: string,
  body: { sentence_a?: string; sentence_b?: string; context?: string }
): Promise<void> {
  await requestVoid(
    `/api/conversations/${conversationId}/crossing`,
    "Update crossing failed",
    {
      method: "PUT",
      auth: true,
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    }
  );
}

export async function completeCrossing(
  conversationId: string,
  body: { sentence: string; context?: string }
): Promise<{ id: string; sentence: string; context: string | null; image_url: string | null }> {
  return requestJson<{ id: string; sentence: string; context: string | null; image_url: string | null }>(
    `/api/conversations/${conversationId}/crossing/complete`,
    "Complete crossing failed",
    {
      method: "POST",
      auth: true,
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    }
  );
}

export async function abandonCrossing(conversationId: string): Promise<void> {
  await requestVoid(
    `/api/conversations/${conversationId}/crossing/abandon`,
    "Abandon failed",
    { method: "POST", auth: true }
  );
}

// Shift
export async function startShift(conversationId: string): Promise<ShiftDraft & { id: string }> {
  return requestJson<ShiftDraft & { id: string }>(
    `/api/conversations/${conversationId}/shift/start`,
    "Start shift failed",
    { method: "POST", auth: true }
  );
}

export async function getShiftDraft(conversationId: string): Promise<(ShiftDraft & { id: string }) | null> {
  return requestJson<ShiftDraft & { id: string }>(
    `/api/conversations/${conversationId}/shift`,
    "Get shift failed",
    { auth: true, allow404: true }
  );
}

export async function updateShiftDraft(
  conversationId: string,
  body: { a_before?: string; a_after?: string; b_before?: string; b_after?: string }
): Promise<void> {
  await requestVoid(`/api/conversations/${conversationId}/shift`, "Update shift failed", {
    method: "PUT",
    auth: true,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export async function completeShift(conversationId: string): Promise<{ id: string }> {
  return requestJson<{ id: string }>(
    `/api/conversations/${conversationId}/shift/complete`,
    "Complete shift failed",
    { method: "POST", auth: true }
  );
}

export async function abandonShift(conversationId: string): Promise<void> {
  await requestVoid(`/api/conversations/${conversationId}/shift/abandon`, "Abandon failed", {
    method: "POST",
    auth: true,
  });
}

// Profile
export interface ProfileThought {
  id: string;
  sentence: string;
  photo_url: string | null;
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
  return requestJson<ProfileResponse>(`/api/users/${userId}/profile`, "Profile failed", {
    auth: true,
  });
}

export interface UpdateProfileBody {
  name?: string;
  photo_url?: string;
  interests?: string[];
}

export async function updateProfile(
  body: UpdateProfileBody
): Promise<Pick<ProfileResponse, "id" | "name" | "photo_url" | "interests">> {
  return requestJson<Pick<ProfileResponse, "id" | "name" | "photo_url" | "interests">>(
    "/api/me/profile",
    "Update failed",
    {
      method: "PUT",
      auth: true,
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    }
  );
}

export async function deleteThought(thoughtId: string): Promise<void> {
  await requestVoid(`/api/thoughts/${thoughtId}`, "Delete failed", {
    method: "DELETE",
    auth: true,
  });
}

export interface CreateThoughtResponse {
  id: string;
  sentence: string;
  context: string;
  photo_url: string | null;
  image_url: string | null;
  created_at: string | null;
}

export async function createThought(
  sentence: string,
  context?: string,
  photoUrl?: string
): Promise<CreateThoughtResponse> {
  return requestJson<CreateThoughtResponse>("/api/thoughts", "Post failed", {
    method: "POST",
    auth: true,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      sentence: sentence.trim(),
      context: (context ?? "").trim() || undefined,
      photo_url: photoUrl?.trim() || undefined,
    }),
  });
}

// Auth (onboarding + login)
export interface RegisterBody {
  name: string;
  photo_url?: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user_id: string;
  onboarding_step: 1 | 2 | 3;
  onboarding_complete: boolean;
}

export async function register(body: RegisterBody): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth/register", "Registration failed", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth/login", "Login failed", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password }),
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });
}

export async function deleteAccount(password: string): Promise<void> {
  await requestVoid("/api/me/account", "Account deletion failed", {
    method: "DELETE",
    auth: true,
    headers: JSON_HEADERS,
    body: JSON.stringify({ password }),
  });
}
