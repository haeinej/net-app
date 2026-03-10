import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "../theme";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "Sentient-Light": require("../assets/fonts/Sentient-Light.otf"),
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
        <Stack screenOptions={{ headerShown: false }} initialRouteName="index">
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="thought/[id]" />
          <Stack.Screen name="conversation/[id]" />
          <Stack.Screen name="user/[id]" />
          <Stack.Screen name="post" options={{ presentation: "modal" }} />
        </Stack>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { justifyContent: "center", alignItems: "center" },
});
