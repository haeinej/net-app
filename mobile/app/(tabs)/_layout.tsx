import { Tabs } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors, fontFamily } from "../../theme";

/* eslint-disable @typescript-eslint/no-require-imports */
const ohmLogo = require("../../assets/images/ohm-logo.png");

function WorldsIcon({ focused }: { focused: boolean }) {
  const c = focused ? colors.VERMILLION : colors.TYPE_DARK;
  return (
    <View style={[iconStyles.circle, { borderColor: c }]}>
      {focused && <View style={[iconStyles.dot, { backgroundColor: c }]} />}
    </View>
  );
}

function ConvoIcon({ focused }: { focused: boolean }) {
  return (
    <Image
      source={ohmLogo}
      style={[iconStyles.logo, !focused && { opacity: 0.3 }]}
      contentFit="contain"
    />
  );
}

function MeIcon({ focused }: { focused: boolean }) {
  return (
    <View
      style={[
        iconStyles.filled,
        { backgroundColor: focused ? colors.VERMILLION : colors.TYPE_DARK },
        !focused && { opacity: 0.3 },
      ]}
    />
  );
}

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={[
        tabLabelStyles.text,
        { color: focused ? colors.VERMILLION : colors.TYPE_DARK },
        !focused && { opacity: 0.3 },
      ]}
    >
      {label}
    </Text>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.VERMILLION,
        tabBarInactiveTintColor: colors.TYPE_MUTED,
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Worlds",
          tabBarIcon: ({ focused }) => <WorldsIcon focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Worlds" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="conversations"
        options={{
          title: "Conversations",
          tabBarIcon: ({ focused }) => <ConvoIcon focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Conversations" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: "Me",
          tabBarIcon: ({ focused }) => <MeIcon focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Me" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const iconStyles = StyleSheet.create({
  circle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  logo: {
    width: 18,
    height: 18,
  },
  filled: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
});

const tabLabelStyles = StyleSheet.create({
  text: {
    fontFamily: fontFamily.comico,
    fontSize: 5.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 1,
  },
});

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.WARM_GROUND,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(26,26,22,0.05)",
    elevation: 0,
    shadowOpacity: 0,
    paddingTop: 6,
  },
});
