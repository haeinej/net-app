import { useEffect } from "react";
import { Tabs } from "expo-router";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";
import { colors } from "../../theme";
import { requestPushPermissionIfNeeded } from "../../lib/notifications";

/* eslint-disable @typescript-eslint/no-require-imports */
const ohmLogo = require("../../assets/images/ohm-logo.png");

function WorldsIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[iconStyles.blob, { borderColor: focused ? colors.TYPE_DARK : colors.TYPE_MUTED }]}>
      {focused && <View style={[iconStyles.dot, { backgroundColor: colors.TYPE_DARK }]} />}
    </View>
  );
}

function PostIcon({ focused }: { focused: boolean }) {
  return (
    <View style={iconStyles.logoWrap}>
      <Image
        source={ohmLogo}
        style={[iconStyles.logoIcon, !focused && iconStyles.logoIconInactive]}
        contentFit="contain"
      />
    </View>
  );
}

function MeIcon({ focused }: { focused: boolean }) {
  return (
    <View
      style={[
        iconStyles.meBlob,
        { backgroundColor: focused ? colors.TYPE_DARK : colors.TYPE_MUTED },
      ]}
    />
  );
}

const WAVE_HEIGHT = 16;
const TAB_BAR_HEIGHT = 74;

function WavyTabBackground() {
  const { width } = useWindowDimensions();
  const w = width;
  const h = WAVE_HEIGHT;

  // Single smooth asymmetric curve — gentle, organic, not busy
  const wavePath = `
    M0,${h}
    L0,${h * 0.6}
    Q${w * 0.25},${-h * 0.15}
     ${w * 0.52},${h * 0.35}
    Q${w * 0.78},${h * 0.85}
     ${w},${h * 0.2}
    L${w},${h}
    Z
  `;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ position: "absolute", top: -h + 1 }}
      >
        <Path d={wavePath} fill={colors.WARM_GROUND} />
      </Svg>
      <View style={{ flex: 1, backgroundColor: colors.WARM_GROUND }} />
    </View>
  );
}

export default function TabLayout() {
  // Register push token on every app launch (idempotent — server upserts)
  useEffect(() => {
    requestPushPermissionIfNeeded().catch(() => {});
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabBarItem,
        tabBarActiveTintColor: colors.TYPE_DARK,
        tabBarInactiveTintColor: colors.TYPE_MUTED,
        tabBarShowLabel: false,
        tabBarBackground: () => <WavyTabBackground />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Worlds",
          tabBarIcon: ({ focused }) => <WorldsIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="post"
        options={{
          title: "Post",
          tabBarIcon: ({ focused }) => <PostIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: "Me",
          tabBarIcon: ({ focused }) => <MeIcon focused={focused} />,
          sceneStyle: { backgroundColor: colors.TYPE_DARK },
        }}
      />
    </Tabs>
  );
}

const iconStyles = StyleSheet.create({
  iconLift: {
    transform: [{ translateY: -6 }],
  },
  blob: {
    width: 22,
    height: 20,
    borderTopLeftRadius: 11,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 13,
    borderWidth: 1.6,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: -6 }, { rotate: "-4deg" }],
  },
  dot: {
    width: 6,
    height: 6,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    transform: [{ rotate: "6deg" }],
  },
  meBlob: {
    width: 20,
    height: 18,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 11,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 8,
    transform: [{ rotate: "3deg" }],
  },
  logoWrap: {
    transform: [{ translateY: -1 }],
  },
  logoIcon: {
    width: 22,
    height: 22,
  },
  logoIconInactive: {
    opacity: 0.58,
  },
});

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "transparent",
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    paddingTop: 6,
    paddingBottom: 18,
    height: TAB_BAR_HEIGHT,
    overflow: "visible",
  },
  tabBarItem: {
    paddingTop: 2,
  },
});
