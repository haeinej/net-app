const KEY_TOKEN = "ohm.auth.token";
const KEY_USER_ID = "ohm.auth.userId";
const KEY_ONBOARDING_COMPLETE = "ohm.auth.onboardingComplete";
const KEY_ONBOARDING_STEP = "ohm.auth.onboardingStep";

function getItem(key: string): string | null {
  return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
}

function setItem(key: string, value: string): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
}

function deleteItem(key: string): void {
  if (typeof localStorage !== "undefined") localStorage.removeItem(key);
}

export async function getStoredToken(): Promise<string | null> {
  return getItem(KEY_TOKEN);
}

export async function getStoredUserId(): Promise<string | null> {
  return getItem(KEY_USER_ID);
}

export async function getOnboardingComplete(): Promise<boolean> {
  const v = getItem(KEY_ONBOARDING_COMPLETE);
  return v === "true";
}

export async function getOnboardingStep(): Promise<number> {
  const v = getItem(KEY_ONBOARDING_STEP);
  const n = parseInt(v ?? "1", 10);
  return n >= 1 && n <= 3 ? n : 1;
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

export async function clearAuth(): Promise<void> {
  deleteItem(KEY_TOKEN);
  deleteItem(KEY_USER_ID);
  deleteItem(KEY_ONBOARDING_COMPLETE);
  deleteItem(KEY_ONBOARDING_STEP);
}
