import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, View, ActivityIndicator, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "../theme";
import { ErrorBoundary } from "../components/ErrorBoundary";
import {
  setupForegroundHandler,
  addNotificationResponseListener,
  getLastNotificationResponse,
} from "../lib/notifications";
import { resolveNotificationRoute } from "../lib/notification-routing";

// Must run at module level before any notification arrives
setupForegroundHandler();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "Sentient-Medium": require("../assets/fonts/Sentient-Light.otf"),
    "Sentient-Bold": require("../assets/fonts/Sentient-Bold.otf"),
    "Comico-Regular": require("../assets/fonts/Comico-Regular.otf"),
  });

  const router = useRouter();

  // Handle notification taps (warm start + cold start)
  useEffect(() => {
    // Cold start: check if app was opened from a notification tap
    getLastNotificationResponse().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const route = resolveNotificationRoute(data);
      if (route) router.push(route as never);
    });

    // Warm start: listen for taps while app is in foreground
    const unsub = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const route = resolveNotificationRoute(data);
      if (route) router.push(route as never);
    });

    return unsub;
  }, [router]);

  if (fontError) {
    console.warn("Font loading failed:", fontError);
  }

  if (!fontsLoaded && !fontError) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator size="large" color={colors.TYPE_MUTED} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.root}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.WARM_GROUND },
              animation: Platform.OS === "ios" ? "default" : "fade_from_bottom",
            }}
            initialRouteName="index"
          >
            <Stack.Screen name="index" options={{ animation: "none" }} />
            <Stack.Screen name="intro" options={{ animation: "none" }} />
            <Stack.Screen name="login" options={{ animation: "none" }} />
            <Stack.Screen name="verify-email" options={{ animation: "none" }} />
            <Stack.Screen name="reset-password" options={{ animation: "none" }} />
            <Stack.Screen name="enter-invite" options={{ animation: "none" }} />
            <Stack.Screen name="invite/[code]" options={{ animation: "none" }} />
            <Stack.Screen name="onboarding" options={{ animation: "none" }} />
            <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
            <Stack.Screen name="thought/[id]" />
            <Stack.Screen name="conversation/[id]" />
            <Stack.Screen name="user/[id]" />
            <Stack.Screen
              name="post"
              options={{
                presentation: "modal",
                animation: "slide_from_bottom",
              }}
            />
            <Stack.Screen name="settings" />
            <Stack.Screen name="support" />
            <Stack.Screen name="privacy" />
            <Stack.Screen name="terms" />
            <Stack.Screen name="delete-account" />
          </Stack>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { justifyContent: "center", alignItems: "center" },
});
