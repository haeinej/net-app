import { Tabs } from "expo-router";
import { View, StyleSheet, useWindowDimensions, Image } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../../theme";

/* eslint-disable @typescript-eslint/no-require-imports */
const ohmLogo = require("../../assets/images/ohm-logo.png");

function WorldsIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[iconStyles.blob, { borderColor: focused ? colors.TYPE_DARK : colors.TYPE_MUTED }]}>
      {focused && <View style={[iconStyles.dot, { backgroundColor: colors.TYPE_DARK }]} />}
    </View>
  );
}

function ConvoIcon({ focused }: { focused: boolean }) {
  return (
    <Image
      source={ohmLogo}
      style={[iconStyles.ohmIcon, { opacity: focused ? 1 : 0.4 }]}
      resizeMode="contain"
    />
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

const WAVE_HEIGHT = 22;
const TAB_BAR_HEIGHT = 74;

function WavyTabBackground() {
  const { width } = useWindowDimensions();
  const svgW = width;
  const svgH = WAVE_HEIGHT;

  // Organic wave path — gentle asymmetric curve
  const wavePath = `
    M0,${svgH}
    L0,${svgH * 0.55}
    C${svgW * 0.12},${svgH * 0.15}
     ${svgW * 0.28},0
     ${svgW * 0.42},${svgH * 0.08}
    C${svgW * 0.52},${svgH * 0.14}
     ${svgW * 0.58},${svgH * 0.28}
     ${svgW * 0.68},${svgH * 0.12}
    C${svgW * 0.8},${svgH * -0.06}
     ${svgW * 0.92},${svgH * 0.1}
     ${svgW},${svgH * 0.4}
    L${svgW},${svgH}
    Z
  `;

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Wave curve sits above the flat bar */}
      <Svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ position: "absolute", top: -WAVE_HEIGHT + 2 }}
      >
        <Path d={wavePath} fill={colors.WARM_GROUND} />
      </Svg>
      {/* Flat fill below the wave */}
      <View style={{ flex: 1, backgroundColor: colors.WARM_GROUND }} />
    </View>
  );
}

export default function TabLayout() {
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
        name="conversations"
        options={{
          title: "Conversations",
          tabBarIcon: ({ focused }) => <ConvoIcon focused={focused} />,
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
    transform: [{ rotate: "-4deg" }],
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
  ohmIcon: {
    width: 21,
    height: 21,
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
