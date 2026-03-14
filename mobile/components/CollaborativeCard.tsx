import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors, spacing, typography, fontFamily } from "../theme";
import type { FeedItemCollaborative } from "../lib/api";

interface CollaborativeCardProps {
  item: FeedItemCollaborative;
}

function ParticipantBlock({
  name,
  photoUrl,
  before,
  after,
}: {
  name: string | null;
  photoUrl: string | null;
  before: string;
  after: string;
}) {
  return (
    <View style={styles.participantBlock}>
      <View style={styles.identityRow}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]} />
        )}
        <Text style={styles.participantName}>{(name ?? "someone").toUpperCase()}</Text>
      </View>
      <Text style={styles.beforeText}>
        <Text style={styles.beforeAfterLabel}>Before: </Text>
        {before}
      </Text>
      <Text style={styles.afterText}>
        <Text style={styles.beforeAfterLabel}>After: </Text>
        {after}
      </Text>
    </View>
  );
}

export function CollaborativeCard({ item }: CollaborativeCardProps) {
  const createdAt = new Date(item.collaborative.created_at);
  const timeLabel = Number.isNaN(createdAt.getTime())
    ? ""
    : createdAt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });

  return (
    <View style={styles.card}>
      <View style={styles.warmthBar} />
      <Text style={styles.label}>CROSSING</Text>
      <View style={styles.titleRow}>
        <Text style={styles.title}>
          Between {item.participant_a.name ?? "someone"} and {item.participant_b.name ?? "someone"}
        </Text>
        {timeLabel ? <Text style={styles.date}>{timeLabel}</Text> : null}
      </View>

      <ParticipantBlock
        name={item.participant_a.name}
        photoUrl={item.participant_a.photo_url}
        before={item.participant_a.before}
        after={item.participant_a.after}
      />

      <View style={styles.divider} />

      <ParticipantBlock
        name={item.participant_b.name}
        photoUrl={item.participant_b.photo_url}
        before={item.participant_b.before}
        after={item.participant_b.after}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.CARD_GROUND,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    overflow: "hidden",
    minHeight: spacing.compactCardHeight,
  },
  warmthBar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 6,
    backgroundColor: colors.VERMILLION,
  },
  label: {
    ...typography.label,
    color: colors.TYPE_MUTED,
    fontSize: 9.5,
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  title: {
    fontFamily: fontFamily.sentientBold,
    fontSize: 24,
    lineHeight: 31,
    color: colors.TYPE_DARK,
    flex: 1,
  },
  date: {
    ...typography.label,
    color: colors.TYPE_MUTED,
    fontSize: 9.5,
    marginTop: 4,
  },
  participantBlock: {
    gap: 6,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  avatarPlaceholder: {
    backgroundColor: colors.CARD_BORDER,
  },
  participantName: {
    ...typography.label,
    color: colors.TYPE_MUTED,
    fontSize: 9.5,
  },
  beforeAfterLabel: {
    fontFamily: fontFamily.sentientBold,
    color: colors.TYPE_DARK,
  },
  beforeText: {
    ...typography.context,
    color: colors.TYPE_DARK,
    fontSize: 17,
    lineHeight: 24,
  },
  afterText: {
    ...typography.context,
    color: colors.TYPE_DARK,
    fontSize: 17,
    lineHeight: 24,
  },
  divider: {
    height: 1,
    backgroundColor: colors.CARD_BORDER,
    marginVertical: 14,
  },
});
