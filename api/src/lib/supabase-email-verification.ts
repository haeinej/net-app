type SendVerificationEmailParams = {
  email: string;
  name: string | null;
  userId: string;
};

type VerifyEmailParams =
  | {
      email: string;
      code: string;
      tokenHash?: never;
      type?: string | null;
    }
  | {
      email?: string;
      code?: string;
      tokenHash: string;
      type?: string | null;
    };

type SupabaseVerifyResponse = {
  user?: {
    email?: string | null;
  } | null;
};

const DEFAULT_EMAIL_VERIFICATION_REDIRECT_URL = "https://www.ohmmmm.com/verify-email/";

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set for Supabase email verification`);
  }
  return value;
}

function getSupabaseUrl(): string {
  return readRequiredEnv("SUPABASE_URL").replace(/\/+$/, "");
}

function getSupabaseAnonKey(): string {
  return readRequiredEnv("SUPABASE_ANON_KEY");
}

function getRedirectUrl(): string {
  const configured = process.env.EMAIL_VERIFICATION_REDIRECT_URL?.trim();

  // Accept either the app deep link or the dedicated web handoff page.
  // The web page immediately forwards into the app and provides a fallback button
  // for environments where custom schemes are not clickable in the email client.
  if (configured?.startsWith("ohm://")) {
    return configured;
  }
  if (
    configured?.startsWith("https://www.ohmmmm.com/verify-email") ||
    configured?.startsWith("https://ohmmmm.com/verify-email")
  ) {
    return configured;
  }

  return DEFAULT_EMAIL_VERIFICATION_REDIRECT_URL;
}

function getHeaders(): Record<string, string> {
  const apikey = getSupabaseAnonKey();
  return {
    apikey,
    Authorization: `Bearer ${apikey}`,
    "Content-Type": "application/json",
  };
}

function normalizeErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;

  const record = payload as Record<string, unknown>;
  const candidate =
    record.msg ??
    record.error_description ??
    record.error ??
    record.message;

  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : fallback;
}

function normalizeVerifyType(type: string | null | undefined): string {
  switch (type) {
    case "signup":
    case "magiclink":
    case "recovery":
    case "invite":
    case "email_change":
    case "email":
      return type;
    default:
      return "email";
  }
}

async function postSupabaseAuth<T>(
  path: string,
  body: Record<string, unknown>,
  fallbackError: string
): Promise<T> {
  const response = await fetch(`${getSupabaseUrl()}/auth/v1${path}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as T | Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(normalizeErrorMessage(payload, fallbackError));
  }

  return (payload ?? {}) as T;
}

export async function sendSupabaseVerificationEmail(
  params: SendVerificationEmailParams
): Promise<void> {
  await postSupabaseAuth<unknown>(
    "/otp",
    {
      email: params.email,
      create_user: true,
      email_redirect_to: getRedirectUrl(),
      data: {
        app_user_id: params.userId,
        name: params.name,
      },
    },
    "Could not send verification email"
  );
}

export async function verifySupabaseEmail(
  params: VerifyEmailParams
): Promise<{ email: string }> {
  const payload = await postSupabaseAuth<SupabaseVerifyResponse>(
    "/verify",
    params.tokenHash
      ? {
          token_hash: params.tokenHash,
          type: normalizeVerifyType(params.type),
        }
      : {
          email: params.email,
          token: params.code,
          type: "email",
        },
    "Could not verify email"
  );

  const email = payload.user?.email?.trim().toLowerCase();
  if (!email) {
    throw new Error("Could not verify email");
  }

  return { email };
}
