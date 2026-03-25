import * as SecureStore from "expo-secure-store";

const KEY_TOKEN = "ohm.auth.token";
const KEY_USER_ID = "ohm.auth.userId";
const KEY_ONBOARDING_COMPLETE = "ohm.auth.onboardingComplete";
const KEY_ONBOARDING_STEP = "ohm.auth.onboardingStep";
const KEY_SHOW_INTRO = "ohm.ui.showIntro";
const KEY_WALKTHROUGH_COMPLETE = "ohm.ui.walkthroughComplete";

export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_TOKEN);
}

export async function getStoredUserId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_USER_ID);
}

export async function getOnboardingComplete(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(KEY_ONBOARDING_COMPLETE);
  return v === "true";
}

export async function getOnboardingStep(): Promise<number> {
  const v = await SecureStore.getItemAsync(KEY_ONBOARDING_STEP);
  const n = parseInt(v ?? "1", 10);
  return n >= 1 && n <= 3 ? n : 1;
}

export async function getShouldShowIntro(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(KEY_SHOW_INTRO);
  return v !== "false";
}

export async function setAuth(token: string, userId: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_TOKEN, token);
  await SecureStore.setItemAsync(KEY_USER_ID, userId);
}

export async function setOnboardingComplete(value: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY_ONBOARDING_COMPLETE, value ? "true" : "false");
}

export async function setOnboardingStep(step: number): Promise<void> {
  await SecureStore.setItemAsync(KEY_ONBOARDING_STEP, String(step));
}

export async function getWalkthroughComplete(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(KEY_WALKTHROUGH_COMPLETE);
  return v === "true";
}

export async function setWalkthroughComplete(): Promise<void> {
  await SecureStore.setItemAsync(KEY_WALKTHROUGH_COMPLETE, "true");
}

export async function dismissIntro(): Promise<void> {
  await SecureStore.setItemAsync(KEY_SHOW_INTRO, "false");
}

export async function resetIntroForLogout(): Promise<void> {
  await SecureStore.setItemAsync(KEY_SHOW_INTRO, "true");
}

export async function clearAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_TOKEN);
  await SecureStore.deleteItemAsync(KEY_USER_ID);
  await SecureStore.deleteItemAsync(KEY_ONBOARDING_COMPLETE);
  await SecureStore.deleteItemAsync(KEY_ONBOARDING_STEP);
  await SecureStore.deleteItemAsync("ohm.push.token").catch(() => {});
}
