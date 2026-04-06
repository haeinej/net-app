/**
 * Web-only auth store — uses localStorage instead of expo-secure-store
 * (which is native-only and crashes on web import).
 */

const KEY_TOKEN = "ohm.auth.token";
const KEY_USER_ID = "ohm.auth.userId";
const KEY_ONBOARDING_COMPLETE = "ohm.auth.onboardingComplete";
const KEY_ONBOARDING_STEP = "ohm.auth.onboardingStep";
const KEY_ONBOARDING_DEFERRED = "ohm.auth.onboardingDeferred";
const KEY_SHOW_INTRO = "ohm.ui.showIntro";

function getItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function setItem(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* noop */ }
}

function deleteItem(key: string): void {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

export async function getStoredToken(): Promise<string | null> {
  return getItem(KEY_TOKEN);
}

export async function getStoredUserId(): Promise<string | null> {
  return getItem(KEY_USER_ID);
}

export async function getOnboardingComplete(): Promise<boolean> {
  return getItem(KEY_ONBOARDING_COMPLETE) === "true";
}

export async function getOnboardingStep(): Promise<number> {
  const v = getItem(KEY_ONBOARDING_STEP);
  const n = parseInt(v ?? "1", 10);
  return n >= 1 && n <= 3 ? n : 1;
}

export async function getOnboardingDeferred(): Promise<boolean> {
  return getItem(KEY_ONBOARDING_DEFERRED) === "true";
}

export async function getShouldShowIntro(): Promise<boolean> {
  return getItem(KEY_SHOW_INTRO) !== "false";
}

export async function setAuth(token: string, userId: string): Promise<void> {
  setItem(KEY_TOKEN, token);
  setItem(KEY_USER_ID, userId);
}

export async function setOnboardingComplete(value: boolean): Promise<void> {
  setItem(KEY_ONBOARDING_COMPLETE, value ? "true" : "false");
}

export async function setOnboardingStep(step: number): Promise<void> {
  setItem(KEY_ONBOARDING_STEP, String(step));
}

export async function setOnboardingDeferred(value: boolean): Promise<void> {
  setItem(KEY_ONBOARDING_DEFERRED, value ? "true" : "false");
}

export async function dismissIntro(): Promise<void> {
  setItem(KEY_SHOW_INTRO, "false");
}

export async function resetIntroForLogout(): Promise<void> {
  setItem(KEY_SHOW_INTRO, "true");
}

export async function clearAuth(): Promise<void> {
  deleteItem(KEY_TOKEN);
  deleteItem(KEY_USER_ID);
  deleteItem(KEY_ONBOARDING_COMPLETE);
  deleteItem(KEY_ONBOARDING_STEP);
  deleteItem(KEY_ONBOARDING_DEFERRED);
}
