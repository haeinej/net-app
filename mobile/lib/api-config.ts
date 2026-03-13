const DEV_API_URL = "http://127.0.0.1:3000";
const MISSING_RELEASE_API_URL = "https://missing-api-url.invalid";
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_URL = configuredApiUrl
  ? configuredApiUrl.replace(/\/$/, "")
  : (__DEV__ ? DEV_API_URL : MISSING_RELEASE_API_URL);

export function getApiReachabilityMessage(): string {
  return `Cannot reach API at ${API_URL}. Start the API server and verify EXPO_PUBLIC_API_URL. Release builds must set EXPO_PUBLIC_API_URL in the EAS environment.`;
}

export function getApiTimeoutMessage(timeoutMs: number): string {
  return `API timeout after ${timeoutMs / 1000}s. Check that the API server is running at ${API_URL}.`;
}
