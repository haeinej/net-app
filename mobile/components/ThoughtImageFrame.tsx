import { useEffect, type ReactNode } from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Circle,
  Defs,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import Animated, {
  createAnimatedComponent,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../theme";

const AnimatedCircle = createAnimatedComponent(Circle);

const BRAND_PALETTE = [
  colors.VERMILLION,
  colors.OLIVE,
  colors.CHARTREUSE,
  colors.WARM_GROUND,
] as const;

type MeshBlob = {
  color: string;
  cx: number;
  cy: number;
  r: number;
  driftX: number;
  driftY: number;
  duration: number;
  phase: number;
  gradientId: string;
};

interface ThoughtImageFrameProps {
  thoughtText: string;
  imageUrl?: string | null;
  aspectRatio?: string | number;
  borderRadius?: number;
  overlayStrength?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash || 1);
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function withAlpha(hex: string, alpha: number): string {
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const value = Math.round(safeAlpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${value}`;
}

function parseAspectRatio(aspectRatio: string | number | undefined): number {
  if (typeof aspectRatio === "number" && Number.isFinite(aspectRatio) && aspectRatio > 0) {
    return aspectRatio;
  }
  if (typeof aspectRatio === "string") {
    const [width, height] = aspectRatio.split("/").map((value) => Number(value.trim()));
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return width / height;
    }
  }
  return 4 / 5;
}

function buildMesh(thoughtText: string) {
  const seed = hashText(thoughtText.trim() || "ohm");
  const rand = seededRandom(seed);

  const washAngle = Math.floor(rand() * 360);
  const washA = BRAND_PALETTE[Math.floor(rand() * BRAND_PALETTE.length)] ?? colors.OLIVE;
  const washB = BRAND_PALETTE[Math.floor(rand() * BRAND_PALETTE.length)] ?? colors.VERMILLION;
  const blobCount = 3;
  const blobs: MeshBlob[] = Array.from({ length: blobCount }, (_, index) => ({
    color: BRAND_PALETTE[Math.floor(rand() * BRAND_PALETTE.length)] ?? colors.OLIVE,
    cx: 10 + rand() * 80,
    cy: 10 + rand() * 80,
    r: 28 + rand() * 30,
    driftX: 4 + rand(),
    driftY: 4 + rand(),
    duration: 10000 + rand() * 8000,
    phase: rand() * Math.PI * 2,
    gradientId: `mesh-grad-${seed}-${index}`,
  }));
  const grainDots = Array.from({ length: 96 }, (_, index) => ({
    key: `grain-${seed}-${index}`,
    cx: rand() * 100,
    cy: rand() * 100,
    r: 0.15 + rand() * 0.4,
    opacity: 0.03 + rand() * 0.05,
  }));
  const vignetteId = `mesh-vignette-${seed}`;

  const radians = (washAngle * Math.PI) / 180;
  const start = {
    x: 0.5 - Math.cos(radians) * 0.5,
    y: 0.5 - Math.sin(radians) * 0.5,
  };
  const end = {
    x: 0.5 + Math.cos(radians) * 0.5,
    y: 0.5 + Math.sin(radians) * 0.5,
  };

  return {
    seed,
    washA,
    washB,
    washStart: start,
    washEnd: end,
    blobs,
    grainDots,
    vignetteId,
  };
}

function MeshBlobCircle({ blob }: { blob: MeshBlob }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: blob.duration }),
      -1,
      true
    );
  }, [blob.duration, progress]);

  const animatedProps = useAnimatedProps(() => {
    const angle = progress.value * Math.PI * 2 + blob.phase;
    return {
      cx: blob.cx + Math.cos(angle) * blob.driftX,
      cy: blob.cy + Math.sin(angle) * blob.driftY,
    };
  });

  return (
    <AnimatedCircle
      animatedProps={animatedProps}
      cy={blob.cy}
      r={blob.r}
      fill={`url(#${blob.gradientId})`}
    />
  );
}

export function ThoughtImageFrame({
  thoughtText,
  imageUrl,
  aspectRatio = "4/5",
  borderRadius = 14,
  overlayStrength = 0.32,
  style,
  children,
}: ThoughtImageFrameProps) {
  const ratio = parseAspectRatio(aspectRatio);
  const hasPhoto = Boolean(imageUrl);
  const mesh = buildMesh(thoughtText);
  const meshOpacity = hasPhoto ? overlayStrength : Math.max(0.68, overlayStrength * 2);
  const washOpacity = hasPhoto ? overlayStrength * 0.5 : 0.42;
  const grainOpacity = 0.06 + meshOpacity * 0.06;

  return (
    <View
      style={[
        styles.frame,
        {
          aspectRatio: ratio,
          borderRadius,
          backgroundColor: hasPhoto ? colors.PANEL_DEEP : colors.WARM_GROUND,
        },
        style,
      ]}
    >
      {hasPhoto ? (
        <Image
          source={{ uri: imageUrl ?? undefined }}
          style={styles.photo}
          contentFit="cover"
        />
      ) : null}

      <LinearGradient
        colors={[
          withAlpha(mesh.washA, 0.32),
          withAlpha(mesh.washB, 0.28),
        ]}
        start={mesh.washStart}
        end={mesh.washEnd}
        style={[StyleSheet.absoluteFillObject, { opacity: washOpacity }]}
      />

      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        style={[styles.overlay, { opacity: meshOpacity }]}
      >
        <Defs>
          {mesh.blobs.map((blob) => (
            <RadialGradient
              id={blob.gradientId}
              key={blob.gradientId}
              cx="50%"
              cy="50%"
              r="50%"
            >
              <Stop offset="0%" stopColor={withAlpha(blob.color, hasPhoto ? 0.62 : 0.84)} />
              <Stop offset="100%" stopColor={withAlpha(blob.color, 0)} />
            </RadialGradient>
          ))}
          <RadialGradient id={mesh.vignetteId} cx="50%" cy="50%" r="62%">
            <Stop offset="50%" stopColor="rgba(0,0,0,0)" />
            <Stop offset="100%" stopColor="rgba(26,23,20,0.18)" />
          </RadialGradient>
        </Defs>

        {mesh.blobs.map((blob) => (
          <MeshBlobCircle blob={blob} key={blob.gradientId} />
        ))}

        {mesh.grainDots.map((dot) => (
          <Circle
            key={dot.key}
            cx={dot.cx}
            cy={dot.cy}
            r={dot.r}
            fill={withAlpha(colors.TYPE_WHITE, dot.opacity)}
            opacity={grainOpacity}
          />
        ))}

        <Rect x="0" y="0" width="100" height="100" fill={`url(#${mesh.vignetteId})`} />
      </Svg>

      {children ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    position: "relative",
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    ...StyleSheet.absoluteFillObject,
  },
});
