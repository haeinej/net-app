import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { colors, spacing, typography, fontFamily } from "../theme";
import type { FeedItemShift } from "../lib/api";

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

export function ShiftCard({ item }: { item: FeedItemShift }) {
  const { width } = useWindowDimensions();
  const halfWidth = (width - spacing.screenPadding * 2 - spacing.warmthBarWidth) / 2;
  const photoSize = 40;

  return (
    <View style={styles.card}>
      <View style={styles.cardInner}>
        <View style={[styles.half, { width: halfWidth }]}>
          {item.participant_a.photo_url ? (
            <Image source={{ uri: item.participant_a.photo_url }} style={[styles.photo, { width: photoSize, height: photoSize, borderRadius: photoSize / 2 }]} />
          ) : (
            <View style={[styles.photo, styles.photoPlc, { width: photoSize, height: photoSize, borderRadius: photoSize / 2 }]} />
          )}
          <Text style={styles.beforeLabel}>Before</Text>
          <Text style={styles.beforeText} numberOfLines={2}>{item.participant_a.before}</Text>
          <Text style={styles.afterLabel}>After</Text>
          <Text style={styles.afterText} numberOfLines={2}>{item.participant_a.after}</Text>
          <Text style={styles.name}>{item.participant_a.name ? item.participant_a.name.toUpperCase() : "—"}</Text>
        </View>
        <View style={[styles.half, { width: halfWidth }]}>
          {item.participant_b.photo_url ? (
            <Image source={{ uri: item.participant_b.photo_url }} style={[styles.photo, { width: photoSize, height: photoSize, borderRadius: photoSize / 2 }]} />
          ) : (
            <View style={[styles.photo, styles.photoPlc, { width: photoSize, height: photoSize, borderRadius: photoSize / 2 }]} />
          )}
          <Text style={styles.beforeLabel}>Before</Text>
          <Text style={styles.beforeText} numberOfLines={2}>{item.participant_b.before}</Text>
          <Text style={styles.afterLabel}>After</Text>
          <Text style={styles.afterText} numberOfLines={2}>{item.participant_b.after}</Text>
          <Text style={styles.name}>{item.participant_b.name ? item.participant_b.name.toUpperCase() : "—"}</Text>
        </View>
      </View>
      <Text style={styles.timestamp}>{formatRelativeTime(item.created_at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: spacing.cardRadius,
    overflow: "hidden",
    backgroundColor: colors.CARD_GROUND,
    padding: 16,
  },
  cardInner: {
    flexDirection: "row",
    gap: 12,
  },
  half: {
    flex: 1,
  },
  photo: {
    marginBottom: 8,
  },
  photoPlc: {
    backgroundColor: colors.TYPE_MUTED,
  },
  beforeLabel: {
    fontFamily: fontFamily.sentient,
    fontSize: 8,
    color: colors.TYPE_MUTED,
    marginBottom: 2,
    opacity: 0.8,
  },
  beforeText: {
    fontFamily: fontFamily.sentient,
    fontSize: 10,
    color: colors.TYPE_MUTED,
    marginBottom: 8,
    opacity: 0.6,
  },
  afterLabel: {
    fontFamily: typography.label.fontFamily,
    fontSize: 8,
    color: colors.TYPE_MUTED,
    marginBottom: 2,
  },
  afterText: {
    fontFamily: fontFamily.sentient,
    fontSize: 10,
    color: colors.TYPE_DARK,
    marginBottom: 6,
  },
  name: {
    ...typography.metadata,
    fontSize: 7,
    color: colors.TYPE_MUTED,
  },
  timestamp: {
    ...typography.metadata,
    marginTop: 8,
    color: colors.TYPE_MUTED,
  },
});
