import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoView, useVideoPlayer } from "expo-video";
import { colors, fontFamily, spacing } from "../theme";

const INTRO_VIDEO = require("../assets/videos/intro.mp4");
const CTA_REVEAL_SECONDS = 2;

export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showCta, setShowCta] = useState(false);

  const player = useVideoPlayer(INTRO_VIDEO, (instance) => {
    instance.loop = false;
    instance.muted = false;
    instance.timeUpdateEventInterval = 0.25;
    instance.play();
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const duration = player.duration;
      const currentTime = player.currentTime;
      const status = player.status;

      if (status === "error") {
        setShowCta(true);
        return;
      }

      if (!Number.isFinite(duration) || duration <= 0) {
        return;
      }

      if (currentTime >= Math.max(0, duration - CTA_REVEAL_SECONDS)) {
        setShowCta(true);
      }
    }, 250);

    const playToEndSubscription = player.addListener("playToEnd", () => {
      setShowCta(true);
    });

    const statusSubscription = player.addListener("statusChange", ({ status }) => {
      if (status === "error") {
        setShowCta(true);
      }
    });

    return () => {
      clearInterval(interval);
      playToEndSubscription.remove();
      statusSubscription.remove();
    };
  }, [player]);

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      {showCta ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace("/login")}
            activeOpacity={0.88}
          >
            <Text style={styles.buttonText}>Onboard</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  video: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  footer: {
    position: "absolute",
    left: spacing.screenPadding,
    right: spacing.screenPadding,
    bottom: 0,
    alignItems: "center",
  },
  button: {
    minWidth: 180,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: colors.VERMILLION,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontFamily: fontFamily.comico,
    fontSize: 14,
    letterSpacing: 1.1,
    color: colors.TYPE_WHITE,
  },
});
