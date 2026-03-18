import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, View, ActivityIndicator, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "../theme";
import {
  addNotificationResponseListener,
  addNotificationReceivedListener,
} from "../lib/notifications";

export default function RootLayout() {
  const router = useRouter();

  // Listen for notification taps — navigate to the relevant screen
  useEffect(() => {
    const cleanupResponse = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data as
        | { type?: string; conversation_id?: string }
        | undefined;
      if (data?.type === "message" && data.conversation_id) {
        router.push({
          pathname: "/conversation/[id]",
          params: { id: data.conversation_id },
        });
      } else if (data?.type === "reply") {
        // Go to feed and open notifications
        router.push("/(tabs)");
      }
    });

    // Vibrate on foreground notifications (handled inside the listener)
    const cleanupReceived = addNotificationReceivedListener(() => {});

    return () => {
      cleanupResponse();
      cleanupReceived();
    };
  }, [router]);
  const [fontsLoaded, fontError] = useFonts({
    "Sentient-Medium": require("../assets/fonts/Sentient-Light.otf"),
    "Sentient-Bold": require("../assets/fonts/Sentient-Bold.otf"),
    "Comico-Regular": require("../assets/fonts/Comico-Regular.otf"),
  });

  if (!fontsLoaded && !fontError) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator size="large" color={colors.TYPE_MUTED} />
      </View>
    );
  }

  return (
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
          <Stack.Screen name="index" />
          <Stack.Screen name="intro" />
          <Stack.Screen name="login" options={{ animation: "fade" }} />
          <Stack.Screen name="verify-email" />
          <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
          <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { justifyContent: "center", alignItems: "center" },
});
