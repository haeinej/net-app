import {
  API_URL,
  getApiReachabilityMessage,
  getApiTimeoutMessage,
} from "./api-config";
import {
  DemoHttpError,
  handleDemoRequest,
  isDemoAuthToken,
  loginDemo as startDemoSession,
} from "./demo-mode";

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

function parseRequestBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") return body;

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

async function maybeHandleDemoRequest(
  path: string,
  {
    auth = false,
    method,
    body,
  }: ApiRequestOptions = {}
): Promise<unknown | null> {
  if (!auth) return null;

  const token = await getAuthToken();
  if (!isDemoAuthToken(token)) return null;

  const userId = await getStoredUserIdForApi();
  return handleDemoRequest(path, {
    method,
    userId,
    body: parseRequestBody(body),
  });
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
  try {
    const demoData = await maybeHandleDemoRequest(path, options);
    if (demoData !== null) {
      return demoData as T;
    }
  } catch (error) {
    if (error instanceof DemoHttpError) {
      if (allow404 && error.status === 404) return null;
      throw new ApiError(error.status, error.message);
    }
    throw error;
  }

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
  try {
    const demoData = await maybeHandleDemoRequest(path, options);
    if (demoData !== null || (options.auth && isDemoAuthToken(await getAuthToken()))) {
      return;
    }
  } catch (error) {
    if (error instanceof DemoHttpError) {
      throw new ApiError(error.status, error.message);
    }
    throw error;
  }

  const response = await requestApi(path, options);
  const data = await readJson<{ error?: string }>(response);
  if (!response.ok) {
    throw new ApiError(response.status, getErrorMessage(data, fallbackMessage));
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

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
}

export interface FeedItemCrossing {
  type: "crossing";
  crossing: {
    id: string;
    sentence: string;
    context: string | null;
    created_at: string;
  };
  participant_a: FeedItemUser;
  participant_b: FeedItemUser;
}

export type FeedItem = FeedItemThought | FeedItemCrossing;
export interface FeedPageResponse {
  items: FeedItem[];
  next_cursor: string | null;
}

export interface NotificationItem {
  reply_id: string;
  replier: { id: string; name: string | null; photo_url: string | null } | null;
  reply_preview: string;
  thought: { id: string; sentence: string } | null;
  created_at: string;
}

function normalizeReplyStatus(value: unknown): ThoughtPanel3Reply["status"] {
  return value === "accepted" || value === "deleted" || value === "pending"
    ? value
    : "pending";
}

function normalizeFeedUser(value: unknown, fallbackId = ""): FeedItemUser {
  const record = asRecord(value);
  return {
    id: asString(record?.id) ?? fallbackId,
    name: asNullableString(record?.name),
    photo_url: asNullableString(record?.photo_url),
  };
}

function normalizeFeedItem(value: unknown): FeedItem | null {
  const record = asRecord(value);
  const type = asString(record?.type);

  if (type === "thought") {
    const thought = asRecord(record?.thought);
    const id = asString(thought?.id);
    const sentence = asString(thought?.sentence);
    const createdAt = asString(thought?.created_at);

    if (!id || !sentence || !createdAt) return null;

    return {
      type: "thought",
      thought: {
        id,
        sentence,
        photo_url: asNullableString(thought?.photo_url),
        image_url: asNullableString(thought?.image_url),
        created_at: createdAt,
        has_context: asBoolean(thought?.has_context),
      },
      user: normalizeFeedUser(record?.user),
    };
  }

  if (type === "crossing") {
    const crossing = asRecord(record?.crossing);
    const id = asString(crossing?.id);
    const sentence = asString(crossing?.sentence);
    const createdAt = asString(crossing?.created_at);

    if (!id || !sentence || !createdAt) return null;

    return {
      type: "crossing",
      crossing: {
        id,
        sentence,
        context: asNullableString(crossing?.context),
        created_at: createdAt,
      },
      participant_a: normalizeFeedUser(record?.participant_a),
      participant_b: normalizeFeedUser(record?.participant_b),
    };
  }

  return null;
}

function normalizeFeedPageResponse(value: unknown): FeedPageResponse {
  const record = asRecord(value);
  const items = Array.isArray(record?.items)
    ? record.items
        .map((item) => normalizeFeedItem(item))
        .filter((item): item is FeedItem => item !== null)
    : [];

  return {
    items,
    next_cursor: asNullableString(record?.next_cursor),
  };
}

function normalizeNotificationItems(value: unknown): NotificationItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = asRecord(item);
      const replyId = asString(record?.reply_id);
      const replyPreview = asString(record?.reply_preview);
      const createdAt = asString(record?.created_at);

      if (!replyId || !replyPreview || !createdAt) return null;

      const replierRecord = asRecord(record?.replier);
      const thoughtRecord = asRecord(record?.thought);

      return {
        reply_id: replyId,
        replier: replierRecord
          ? {
              id: asString(replierRecord.id) ?? "",
              name: asNullableString(replierRecord.name),
              photo_url: asNullableString(replierRecord.photo_url),
            }
          : null,
        reply_preview: replyPreview,
        thought:
          thoughtRecord && asString(thoughtRecord.id) && asString(thoughtRecord.sentence)
            ? {
                id: asString(thoughtRecord.id) ?? "",
                sentence: asString(thoughtRecord.sentence) ?? "",
              }
            : null,
        created_at: createdAt,
      } satisfies NotificationItem;
    })
    .filter((item): item is NotificationItem => item !== null);
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

export async function fetchFeed(
  limit: number,
  cursor?: string | null
): Promise<FeedPageResponse> {
  const query = cursor
    ? `/api/feed?limit=${limit}&cursor=${encodeURIComponent(cursor)}`
    : `/api/feed?limit=${limit}`;
  const data = await requestJson<unknown>(query, "Feed failed", { auth: true });
  return normalizeFeedPageResponse(data);
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const data = await requestJson<unknown>("/api/notifications", "Notifications failed", {
    auth: true,
  });
  return normalizeNotificationItems(data);
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
  created_at: string | null;
}

export interface ThoughtPanel3Reply {
  id: string;
  user: { id: string; name: string | null; photo_url: string | null } | null;
  text: string;
  status: "pending" | "accepted" | "deleted";
  can_delete: boolean;
  created_at: string | null;
}

export interface ThoughtDetailResponse {
  panel_1: ThoughtPanel1;
  panel_2: { sentence: string; context: string };
  panel_3: {
    viewer_is_author: boolean;
    replies: ThoughtPanel3Reply[];
    can_reply: boolean;
  };
}

function normalizeThoughtDetailReply(value: unknown): ThoughtPanel3Reply | null {
  const record = asRecord(value);
  const id = asString(record?.id);
  const text = asString(record?.text);

  if (!id || !text) return null;

  return {
    id,
    user: record?.user ? normalizeFeedUser(record.user) : null,
    text,
    status: normalizeReplyStatus(record?.status),
    can_delete: asBoolean(record?.can_delete),
    created_at: asNullableString(record?.created_at),
  };
}

function normalizeThoughtDetailResponse(value: unknown): ThoughtDetailResponse {
  const record = asRecord(value);
  const panel1 = asRecord(record?.panel_1);
  const panel2 = asRecord(record?.panel_2);
  const panel3 = asRecord(record?.panel_3);
  const sentence =
    asString(panel1?.sentence) ??
    asString(panel2?.sentence) ??
    "";

  return {
    panel_1: {
      sentence,
      photo_url: asNullableString(panel1?.photo_url),
      image_url: asNullableString(panel1?.image_url),
      user: panel1?.user ? normalizeFeedUser(panel1.user) : null,
      created_at: asNullableString(panel1?.created_at),
    },
    panel_2: {
      sentence: asString(panel2?.sentence) ?? sentence,
      context: asString(panel2?.context) ?? "",
    },
    panel_3: {
      viewer_is_author: asBoolean(panel3?.viewer_is_author),
      replies: Array.isArray(panel3?.replies)
        ? panel3.replies
            .map((reply) => normalizeThoughtDetailReply(reply))
            .filter((reply): reply is ThoughtPanel3Reply => reply !== null)
        : [],
      can_reply: asBoolean(panel3?.can_reply),
    },
  };
}

export async function fetchThought(id: string): Promise<ThoughtDetailResponse> {
  const data = await requestJson<unknown>(`/api/thoughts/${id}`, "Thought not found", {
    auth: true,
  });
  return normalizeThoughtDetailResponse(data);
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

// Crossing Detail
export interface CrossingDetailReply {
  id: string;
  user: { id: string; name: string | null; photo_url: string | null };
  text: string;
  target_participant_id: string;
  created_at: string;
}

export interface CrossingDetailResponse {
  panel_1: {
    id: string;
    sentence: string;
    participant_a: FeedItemUser;
    participant_b: FeedItemUser;
    created_at: string;
  };
  panel_2: { sentence: string; context: string | null };
  panel_3: { accepted_replies: CrossingDetailReply[]; can_reply: boolean };
}

export async function fetchCrossingDetail(id: string): Promise<CrossingDetailResponse> {
  return requestJson<CrossingDetailResponse>(`/api/crossings/${id}`, "Crossing not found", {
    auth: true,
  });
}

export async function postCrossingReply(
  crossingId: string,
  text: string,
  targetParticipantId: string
): Promise<{ id: string; status: string; created_at: string }> {
  return requestJson<{ id: string; status: string; created_at: string }>(
    `/api/crossings/${crossingId}/reply`,
    "Reply failed",
    {
      method: "POST",
      auth: true,
      headers: JSON_HEADERS,
      body: JSON.stringify({ text, target_participant_id: targetParticipantId }),
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

function normalizeConversationListItem(value: unknown): ConversationListItem | null {
  const record = asRecord(value);
  const id = asString(record?.id);
  if (!id) return null;

  const otherUser = asRecord(record?.other_user);

  return {
    id,
    other_user: otherUser
      ? {
          id: asString(otherUser.id) ?? "",
          name: asNullableString(otherUser.name),
          photo_url: asNullableString(otherUser.photo_url),
        }
      : null,
    last_message_preview: asString(record?.last_message_preview) ?? "",
    last_message_at: asNullableString(record?.last_message_at),
    is_dormant: asBoolean(record?.is_dormant),
    unread: asBoolean(record?.unread),
  };
}

export interface ConversationMessage {
  id: string;
  sender_id: string;
  text: string;
  created_at: string | null;
}

export async function fetchConversations(): Promise<ConversationListItem[]> {
  const data = await requestJson<unknown>("/api/conversations", "Conversations failed", {
    auth: true,
  });
  return Array.isArray(data)
    ? data
        .map((item) => normalizeConversationListItem(item))
        .filter((item): item is ConversationListItem => item !== null)
    : [];
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

// Conversation detail (message_count + crossing state)
export interface CrossingDraft {
  id: string;
  initiator_id: string;
  initiator_name: string | null;
  sentence: string | null;
  context: string | null;
  status: "draft" | "awaiting_other" | "complete" | "abandoned" | "auto_posted";
  submitted_at: string | null;
  auto_post_at: string | null;
  auto_posted_thought_id: string | null;
}

export interface ConversationDetail {
  id: string;
  message_count: number;
  participant_a_id: string;
  participant_b_id: string;
  thought: {
    id: string;
    sentence: string;
    photo_url: string | null;
    image_url: string | null;
  } | null;
  crossing_draft: CrossingDraft | null;
  crossing_complete: boolean;
  crossing_available: boolean;
  next_crossing_message_count: number;
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
  body: { sentence?: string; context?: string }
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
  body: { sentence?: string; context?: string }
): Promise<
  | { status: "awaiting_other"; auto_post_at: string }
  | { status: "complete"; id: string; sentence: string; context: string | null; image_url: string | null }
> {
  return requestJson<
    | { status: "awaiting_other"; auto_post_at: string }
    | { status: "complete"; id: string; sentence: string; context: string | null; image_url: string | null }
  >(
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

// Profile
export interface ProfileThought {
  id: string;
  sentence: string;
  photo_url: string | null;
  image_url: string | null;
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

function normalizeProfileThought(value: unknown): ProfileThought | null {
  const record = asRecord(value);
  const id = asString(record?.id);
  const sentence = asString(record?.sentence);
  if (!id || !sentence) return null;

  return {
    id,
    sentence,
    photo_url: asNullableString(record?.photo_url),
    image_url: asNullableString(record?.image_url),
    created_at: asNullableString(record?.created_at),
  };
}

function normalizeProfileCrossing(value: unknown): ProfileCrossing | null {
  const record = asRecord(value);
  const id = asString(record?.id);
  const sentence = asString(record?.sentence);
  if (!id || !sentence) return null;

  return {
    id,
    sentence,
    context: asNullableString(record?.context),
    image_url: asNullableString(record?.image_url),
    created_at: asNullableString(record?.created_at),
    participant_a: record?.participant_a ? normalizeFeedUser(record.participant_a) : null,
    participant_b: record?.participant_b ? normalizeFeedUser(record.participant_b) : null,
  };
}

function normalizeProfileResponse(value: unknown): ProfileResponse {
  const record = asRecord(value);

  return {
    id: asString(record?.id) ?? "",
    name: asNullableString(record?.name),
    photo_url: asNullableString(record?.photo_url),
    interests: Array.isArray(record?.interests)
      ? record.interests.filter((entry): entry is string => typeof entry === "string")
      : [],
    thoughts: Array.isArray(record?.thoughts)
      ? record.thoughts
          .map((item) => normalizeProfileThought(item))
          .filter((item): item is ProfileThought => item !== null)
      : [],
    crossings: Array.isArray(record?.crossings)
      ? record.crossings
          .map((item) => normalizeProfileCrossing(item))
          .filter((item): item is ProfileCrossing => item !== null)
      : [],
  };
}

export async function fetchProfile(userId: string): Promise<ProfileResponse> {
  const data = await requestJson<unknown>(`/api/users/${userId}/profile`, "Profile failed", {
    auth: true,
  });
  return normalizeProfileResponse(data);
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

export async function editThought(
  thoughtId: string,
  updates: { sentence?: string; context?: string; photo_url?: string }
): Promise<CreateThoughtResponse> {
  return requestJson<CreateThoughtResponse>(
    `/api/thoughts/${thoughtId}`,
    "Edit failed",
    {
      method: "PUT",
      auth: true,
      headers: JSON_HEADERS,
      body: JSON.stringify(updates),
    }
  );
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
  terms_accepted: boolean;
}

export interface RegisterResponse {
  verification_required: true;
  verification_email: string;
}

export interface AuthResponse {
  token: string;
  user_id: string;
  onboarding_step: 1 | 2 | 3;
  onboarding_complete: boolean;
}

export async function register(body: RegisterBody): Promise<RegisterResponse> {
  return requestJson<RegisterResponse>("/api/auth/register", "Registration failed", {
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

export async function loginDemo(): Promise<AuthResponse> {
  return startDemoSession();
}

export async function verifyEmail(email: string, code: string): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth/verify-email", "Email verification failed", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, code }),
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });
}

export async function verifyEmailLink(
  tokenHash: string,
  type?: string
): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth/verify-email", "Email verification failed", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      token_hash: tokenHash,
      type,
    }),
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });
}

export async function resendVerificationEmail(email: string): Promise<void> {
  await requestVoid("/api/auth/resend-verification", "Could not resend verification email", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email }),
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

// Moderation — Report & Block

export type ReportReason =
  | "harassment"
  | "hate_speech"
  | "spam"
  | "sexual_content"
  | "violence"
  | "self_harm"
  | "other";

export type ReportTargetType =
  | "thought"
  | "reply"
  | "crossing"
  | "crossing_reply"
  | "message"
  | "user";

export async function reportContent(
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  description?: string
): Promise<{ id: string; created_at: string }> {
  return requestJson<{ id: string; created_at: string }>(
    "/api/reports",
    "Report failed",
    {
      method: "POST",
      auth: true,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        target_type: targetType,
        target_id: targetId,
        reason,
        description: description?.trim() || undefined,
      }),
    }
  );
}

export async function blockUser(userId: string): Promise<void> {
  await requestVoid("/api/blocks", "Block failed", {
    method: "POST",
    auth: true,
    headers: JSON_HEADERS,
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function unblockUser(userId: string): Promise<void> {
  await requestVoid(`/api/blocks/${userId}`, "Unblock failed", {
    method: "DELETE",
    auth: true,
  });
}

export interface BlockedUser {
  user_id: string;
  name: string | null;
  photo_url: string | null;
  blocked_at: string;
}

export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  return requestJson<BlockedUser[]>("/api/blocks", "Failed to load blocked users", {
    auth: true,
  });
}

export async function checkBlockStatus(userId: string): Promise<boolean> {
  const result = await requestJson<{ blocked: boolean }>(
    `/api/blocks/${userId}/status`,
    "Block status check failed",
    { auth: true }
  );
  return result.blocked;
}

// Push token registration

export async function registerPushToken(
  token: string,
  platform: string
): Promise<void> {
  await requestVoid("/api/push/register", "Push registration failed", {
    method: "POST",
    auth: true,
    headers: JSON_HEADERS,
    body: JSON.stringify({ token, platform }),
  });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await requestVoid("/api/push/register", "Push unregister failed", {
    method: "DELETE",
    auth: true,
    headers: JSON_HEADERS,
    body: JSON.stringify({ token }),
  });
}
