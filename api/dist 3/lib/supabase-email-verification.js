"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSupabaseVerificationEmail = sendSupabaseVerificationEmail;
exports.sendSupabasePasswordRecoveryEmail = sendSupabasePasswordRecoveryEmail;
exports.verifySupabaseEmail = verifySupabaseEmail;
exports.verifySupabaseRecovery = verifySupabaseRecovery;
const DEFAULT_EMAIL_VERIFICATION_REDIRECT_URL = "https://www.ohmmmm.com/verify-email/";
const DEFAULT_PASSWORD_RESET_REDIRECT_URL = "https://www.ohmmmm.com/reset-password/";
function readRequiredEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} must be set for Supabase email verification`);
    }
    return value;
}
function getSupabaseUrl() {
    return readRequiredEnv("SUPABASE_URL").replace(/\/+$/, "");
}
function getSupabaseAnonKey() {
    return readRequiredEnv("SUPABASE_ANON_KEY");
}
function getRedirectUrl() {
    const configured = process.env.EMAIL_VERIFICATION_REDIRECT_URL?.trim();
    // Accept either the app deep link or the dedicated web handoff page.
    // The web page immediately forwards into the app and provides a fallback button
    // for environments where custom schemes are not clickable in the email client.
    if (configured?.startsWith("ohm://")) {
        return configured;
    }
    if (configured?.startsWith("https://www.ohmmmm.com/verify-email") ||
        configured?.startsWith("https://ohmmmm.com/verify-email")) {
        return configured;
    }
    return DEFAULT_EMAIL_VERIFICATION_REDIRECT_URL;
}
function getPasswordResetRedirectUrl() {
    const configured = process.env.PASSWORD_RESET_REDIRECT_URL?.trim();
    if (configured?.startsWith("ohm://")) {
        return configured;
    }
    if (configured?.startsWith("https://www.ohmmmm.com/reset-password") ||
        configured?.startsWith("https://ohmmmm.com/reset-password")) {
        return configured;
    }
    return DEFAULT_PASSWORD_RESET_REDIRECT_URL;
}
function getHeaders() {
    const apikey = getSupabaseAnonKey();
    return {
        apikey,
        Authorization: `Bearer ${apikey}`,
        "Content-Type": "application/json",
    };
}
function normalizeErrorMessage(payload, fallback) {
    if (!payload || typeof payload !== "object")
        return fallback;
    const record = payload;
    const candidate = record.msg ??
        record.error_description ??
        record.error ??
        record.message;
    return typeof candidate === "string" && candidate.trim() ? candidate.trim() : fallback;
}
function normalizeVerifyType(type) {
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
async function postSupabaseAuth(path, body, fallbackError) {
    const response = await fetch(`${getSupabaseUrl()}/auth/v1${path}`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null));
    if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, fallbackError));
    }
    return (payload ?? {});
}
async function getSupabaseUserEmailFromAccessToken(accessToken) {
    const response = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
        method: "GET",
        headers: {
            ...getHeaders(),
            Authorization: `Bearer ${accessToken}`,
        },
    });
    const payload = (await response.json().catch(() => null));
    if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, "Could not verify password reset"));
    }
    const verifiedPayload = payload;
    const email = verifiedPayload?.user?.email?.trim().toLowerCase();
    if (!email) {
        throw new Error("Could not verify password reset");
    }
    return email;
}
async function sendSupabaseVerificationEmail(params) {
    await postSupabaseAuth("/otp", {
        email: params.email,
        create_user: true,
        email_redirect_to: getRedirectUrl(),
        data: {
            app_user_id: params.userId,
            name: params.name,
        },
    }, "Could not send verification email");
}
async function sendSupabasePasswordRecoveryEmail(params) {
    await postSupabaseAuth("/recover", {
        email: params.email,
        redirect_to: getPasswordResetRedirectUrl(),
    }, "Could not send password reset email");
}
async function verifySupabaseEmail(params) {
    const payload = await postSupabaseAuth("/verify", params.tokenHash
        ? {
            token_hash: params.tokenHash,
            type: normalizeVerifyType(params.type),
        }
        : {
            email: params.email,
            token: params.code,
            type: "email",
        }, "Could not verify email");
    const email = payload.user?.email?.trim().toLowerCase();
    if (!email) {
        throw new Error("Could not verify email");
    }
    return { email };
}
async function verifySupabaseRecovery(params) {
    if (params.accessToken) {
        const email = await getSupabaseUserEmailFromAccessToken(params.accessToken);
        return { email };
    }
    const payload = await postSupabaseAuth("/verify", params.tokenHash
        ? {
            token_hash: params.tokenHash,
            type: "recovery",
        }
        : {
            email: params.email,
            token: params.code,
            type: "recovery",
        }, "Could not verify password reset");
    const email = payload.user?.email?.trim().toLowerCase();
    if (!email) {
        throw new Error("Could not verify password reset");
    }
    return { email };
}
