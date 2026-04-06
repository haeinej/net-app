import type { Href } from "expo-router";
import {
  clearAuth,
  getOnboardingComplete,
  getOnboardingDeferred,
  getStoredToken,
  getStoredUserId,
} from "./auth-store";
import {
  fetchProfile,
  isSessionInvalidError,
  setCachedUserId,
} from "./api";

export async function resolveStartupRoute(): Promise<Href> {
  const [token, userId, onboardingComplete, onboardingDeferred] = await Promise.all([
    getStoredToken(),
    getStoredUserId(),
    getOnboardingComplete(),
    getOnboardingDeferred(),
  ]);

  if (token && userId) {
    let sessionValid = true;

    try {
      await fetchProfile(userId);
    } catch (error) {
      if (isSessionInvalidError(error)) {
        sessionValid = false;
        await clearAuth();
        setCachedUserId(null);
      } else {
        console.warn("Startup profile check failed:", error);
      }
    }

    if (sessionValid) {
      return onboardingComplete || onboardingDeferred ? "/(tabs)" : "/onboarding";
    }
  }

  return "/login";
}
