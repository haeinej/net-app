import { Tabs } from "expo-router";
import { View, StyleSheet, useWindowDimensions, Image } from "react-native";
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

const WAVE_HEIGHT = 18;

function WavyTabBackground() {
  const { width } = useWindowDimensions();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.WARM_GROUND }]}>
      <View
        style={[
          styles.waveLip,
          {
            width: width + 24,
            left: -12,
            top: -WAVE_HEIGHT,
          },
        ]}
      />
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
  waveLip: {
    position: "absolute",
    height: WAVE_HEIGHT + 8,
    backgroundColor: colors.WARM_GROUND,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 42,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 24,
    transform: [{ rotate: "-1.2deg" }],
  },
  tabBar: {
    backgroundColor: "transparent",
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    paddingTop: 6,
    paddingBottom: 18,
    height: 74,
    overflow: "visible",
  },
  tabBarItem: {
    paddingTop: 2,
  },
});
