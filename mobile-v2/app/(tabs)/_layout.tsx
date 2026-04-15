import { View, StyleSheet, Platform } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { colors } from "../../theme";
import { AnimatedPressable } from "../../components/ui/AnimatedPressable";

/* eslint-disable @typescript-eslint/no-require-imports */
const ohmLogo = require("../../assets/images/ohm-logo.png");

function FloatingTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottom = Platform.OS === "web" ? 24 : Math.max(insets.bottom, 24);

  return (
    <View style={[styles.tabBarOuter, { bottom }]}>
      <View style={styles.tabBar}>
        {/* Explore blob */}
        <AnimatedPressable
          style={[styles.tabItem, state.index === 0 && styles.tabItemActive]}
          onPress={() => navigation.navigate("index")}
        >
          <View style={[styles.blob, state.index === 0 && styles.blobActive]}>
            {state.index === 0 && <View style={styles.blobDot} />}
          </View>
        </AnimatedPressable>

        {/* Create: ohm logo */}
        <AnimatedPressable
          style={[styles.tabItem, state.index === 1 && styles.tabItemActive]}
          onPress={() => navigation.navigate("post")}
        >
          <Image
            source={ohmLogo}
            style={[styles.tabLogo, { opacity: state.index === 1 ? 0.8 : 0.25 }]}
            contentFit="contain"
          />
        </AnimatedPressable>

        {/* Profile blob */}
        <AnimatedPressable
          style={[styles.tabItem, state.index === 2 && styles.tabItemActive]}
          onPress={() => navigation.navigate("me")}
        >
          <View style={[styles.profileBlob, state.index === 2 && styles.profileBlobActive]} />
        </AnimatedPressable>
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, animation: "fade" }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="post" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarOuter: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 100,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.TAB_BAR,
    borderRadius: 24,
    padding: 5,
    gap: 2,
    ...Platform.select({
      web: { boxShadow: "0 4px 20px rgba(0,0,0,0.08)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 20 },
    }),
  },
  tabItem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  tabItemActive: {
    backgroundColor: "rgba(26,26,22,0.06)",
  },
  blob: {
    width: 20,
    height: 18,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 9,
    borderWidth: 1.4,
    borderColor: colors.TYPE_MUTED,
    transform: [{ rotate: "-4deg" }],
    alignItems: "center",
    justifyContent: "center",
  },
  blobActive: {
    borderColor: colors.TYPE_PRIMARY,
  },
  blobDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.TYPE_PRIMARY,
    transform: [{ rotate: "6deg" }],
  },
  profileBlob: {
    width: 18,
    height: 16,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 7,
    borderWidth: 1.4,
    borderColor: colors.TYPE_MUTED,
    transform: [{ rotate: "4deg" }],
  },
  profileBlobActive: {
    backgroundColor: colors.TYPE_PRIMARY,
    borderColor: colors.TYPE_PRIMARY,
  },
  tabLogo: {
    width: 18,
    height: 18,
  },
});
