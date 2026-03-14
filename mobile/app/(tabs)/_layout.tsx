import { Tabs } from "expo-router";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
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
      style={[iconStyles.iconLift, iconStyles.ohmIcon, { opacity: focused ? 1 : 0.4 }]}
      contentFit="contain"
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
      <View style={{ position: "absolute", top: -WAVE_HEIGHT, left: 0, right: 0 }}>
        <Svg width={width} height={WAVE_HEIGHT} viewBox={`0 0 ${width} ${WAVE_HEIGHT}`}>
          <Path
            d={`M0 ${WAVE_HEIGHT} C${width * 0.15} ${WAVE_HEIGHT * 0.2}, ${width * 0.3} ${WAVE_HEIGHT * 0.7}, ${width * 0.5} ${WAVE_HEIGHT * 0.35} S${width * 0.8} ${WAVE_HEIGHT * 0.05}, ${width} ${WAVE_HEIGHT * 0.6} L${width} ${WAVE_HEIGHT} Z`}
            fill={colors.WARM_GROUND}
          />
        </Svg>
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
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
    width: 32,
    height: 29,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 13,
    borderBottomRightRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: -6 }, { rotate: "-4deg" }],
  },
  dot: {
    width: 8,
    height: 9,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 3.5,
    borderBottomRightRadius: 4,
    transform: [{ rotate: "6deg" }],
  },
  ohmIcon: {
    width: 30,
    height: 30,
  },
  meBlob: {
    width: 29,
    height: 26,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 15,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 10,
    transform: [{ translateY: -6 }, { rotate: "3deg" }],
  },
});

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "transparent",
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    paddingTop: 4,
    paddingBottom: 10,
    height: 62,
    overflow: "visible",
  },
});
