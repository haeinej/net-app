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
  code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function isSessionInvalidError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
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

function getErrorCode(data: unknown): string | null {
  if (
    data &&
    typeof data === "object" &&
    "code" in data &&
    typeof data.code === "string" &&
    data.code.trim()
  ) {
    return data.code;
  }

  return null;
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

  const data = await readJson<T | { error?: string; code?: string }>(response);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      getErrorMessage(data, fallbackMessage),
      getErrorCode(data)
    );
  }

  return data as T;
}

async function requestVoid(
  path: string,
  fallbackMessage: string,
  options: ApiRequestOptions = {}
): Promise<void> {
  const response = await requestApi(path, options);
  const data = await readJson<{ error?: string; code?: string }>(response);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      getErrorMessage(data, fallbackMessage),
      getErrorCode(data)
    );
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
    in_response_to?: {
      id: string;
      sentence: string;
      user: { id: string; name: string | null; photo_url: string | null };
    } | null;
  };
  user: FeedItemUser;
}

export type FeedItem = FeedItemThought;
export interface FeedPageResponse {
  items: FeedItem[];
  next_cursor: string | null;
}

export interface NotificationItem {
  id: string;
  sentence: string;
  author: { id: string; name: string | null; photo_url: string | null } | null;
  original_thought: { id: string; sentence: string } | null;
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

    const rawResponseTo = asRecord(thought?.in_response_to);
    const inResponseTo = rawResponseTo
      ? {
          id: asString(rawResponseTo.id) ?? "",
          sentence: asString(rawResponseTo.sentence) ?? "",
          user: normalizeFeedUser(rawResponseTo.user),
        }
      : null;

    return {
      type: "thought",
      thought: {
        id,
        sentence,
        photo_url: asNullableString(thought?.photo_url),
        image_url: asNullableString(thought?.image_url),
        created_at: createdAt,
        has_context: asBoolean(thought?.has_context),
        in_response_to: inResponseTo,
      },
      user: normalizeFeedUser(record?.user),
    };
  }

  return null;
}

function normalizeFeedPageResponse(value: unknown): FeedPageResponse {
  if (Array.isArray(value)) {
    return {
      items: value
        .map((item) => normalizeFeedItem(item))
        .filter((item): item is FeedItem => item !== null),
      next_cursor: null,
    };
  }

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
      const id = asString(record?.id);
      const sentence = asString(record?.sentence);
      const createdAt = asString(record?.created_at);

      if (!id || !sentence || !createdAt) return null;

      const authorRecord = asRecord(record?.author);
      const originalRecord = asRecord(record?.original_thought);

      return {
        id,
        sentence,
        author: authorRecord
          ? {
              id: asString(authorRecord.id) ?? "",
              name: asNullableString(authorRecord.name),
              photo_url: asNullableString(authorRecord.photo_url),
            }
          : null,
        original_thought:
          originalRecord && asString(originalRecord.id) && asString(originalRecord.sentence)
            ? {
                id: asString(originalRecord.id) ?? "",
                sentence: asString(originalRecord.sentence) ?? "",
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
  cursor?: string | null,
  anchor?: string | null
): Promise<FeedPageResponse> {
  let query = cursor
    ? `/api/feed?limit=${limit}&cursor=${encodeURIComponent(cursor)}`
    : `/api/feed?limit=${limit}`;
  if (anchor) {
    query += `&anchor=${encodeURIComponent(anchor)}`;
  }
  const data = await requestJson<unknown>(query, "Feed failed", { auth: true });
  return normalizeFeedPageResponse(data);
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const data = await requestJson<unknown>("/api/notifications", "Notifications failed", {
    auth: true,
  });
  return normalizeNotificationItems(data);
}

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

// Profile
// Profile
export interface ProfileThought {
  id: string;
  sentence: string;
  photo_url: string | null;
  image_url: string | null;
  created_at: string | null;
}

export interface ProfileResponse {
  id: string;
  name: string | null;
  photo_url: string | null;
  interests?: string[];
  thoughts: ProfileThought[];
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
  terms_accepted?: boolean;
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
  photoUrl?: string,
  inResponseToId?: string
): Promise<CreateThoughtResponse> {
  return requestJson<CreateThoughtResponse>("/api/thoughts", "Post failed", {
    method: "POST",
    auth: true,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      sentence: sentence.trim(),
      context: (context ?? "").trim() || undefined,
      photo_url: photoUrl?.trim() || undefined,
      in_response_to_id: inResponseToId || undefined,
    }),
  });
}

// Auth (onboarding + login)
export type SocialProvider = "google" | "apple";

export interface RegisterBody {
  name: string;
  photo_url: string;
  email: string;
  password: string;
  terms_accepted: boolean;
  invite_code?: string;
}

export interface RegisterResponse {
  verification_required: true;
  verification_email: string;
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

export async function getSocialAuthUrl(
  provider: SocialProvider,
  redirectTo: string
): Promise<{ url: string }> {
  const params = new URLSearchParams({
    provider,
    redirect_to: redirectTo,
  });

  return requestJson<{ url: string }>(
    `/api/auth/social/url?${params.toString()}`,
    "Could not start sign in",
    {
      timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
    }
  );
}

export async function loginWithSocialAccessToken(
  accessToken: string
): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth/social", "Could not finish sign in", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ access_token: accessToken }),
      timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });
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

export async function requestPasswordReset(email: string): Promise<void> {
  await requestVoid("/api/auth/request-password-reset", "Could not send password reset email", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email }),
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });
}

type ResetPasswordPayload =
  | {
      password: string;
      tokenHash: string;
      type?: string;
      email?: never;
      code?: never;
      accessToken?: never;
    }
  | {
      password: string;
      accessToken: string;
      type?: string;
      email?: never;
      code?: never;
      tokenHash?: never;
    }
  | {
      password: string;
      email: string;
      code: string;
      tokenHash?: never;
      accessToken?: never;
      type?: never;
    };

export async function resetPassword(payload: ResetPasswordPayload): Promise<void> {
  const body = "tokenHash" in payload
    ? {
        password: payload.password,
        token_hash: payload.tokenHash,
        type: payload.type,
      }
    : "accessToken" in payload
      ? {
          password: payload.password,
          access_token: payload.accessToken,
          type: payload.type,
        }
    : {
        password: payload.password,
        email: payload.email,
        code: payload.code,
      };

  await requestVoid("/api/auth/reset-password", "Could not reset password", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
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

// Invites

export async function validateInviteCode(code: string): Promise<{ valid: boolean }> {
  return requestJson<{ valid: boolean }>(
    `/api/invites/validate?code=${encodeURIComponent(code)}`,
    "Could not validate invite code",
    { timeoutMs: AUTH_REQUEST_TIMEOUT_MS }
  );
}

export async function fetchMyInvites(): Promise<{ remaining: number }> {
  return requestJson<{ remaining: number }>("/api/me/invites", "Could not fetch invites", {
    auth: true,
  });
}

export async function generateInvite(): Promise<{ code: string; remaining: number }> {
  return requestJson<{ code: string; remaining: number }>(
    "/api/me/invites/generate",
    "Could not generate invite",
    { method: "POST", auth: true }
  );
}

// Thought replies

export async function fetchThoughtReplies(
  thoughtId: string
): Promise<FeedItem[]> {
  const data = await requestJson<{ items: unknown[] }>(
    `/api/thoughts/${encodeURIComponent(thoughtId)}/replies`,
    "Could not fetch replies",
    { auth: true }
  );
  return (data?.items ?? [])
    .map((item) => normalizeFeedItem(item))
    .filter((item): item is FeedItem => item !== null);
}
