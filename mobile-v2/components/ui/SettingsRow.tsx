import { Text, View, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../../theme";
import { AnimatedPressable } from "./AnimatedPressable";

interface SettingsRowProps {
  label: string;
  value?: string;
  onPress?: () => void;
  first?: boolean;
  last?: boolean;
}

export function SettingsRow({
  label,
  value,
  onPress,
  first = false,
  last = false,
}: SettingsRowProps) {
  return (
    <AnimatedPressable
      style={[
        styles.row,
        first && styles.first,
        last && styles.last,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.icon} />
      <Text style={styles.label}>{label}</Text>
      {value && <Text style={styles.value}>{value}</Text>}
      {onPress && (
        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
          <Path
            d="M9 18l6-6-6-6"
            stroke={colors.TYPE_MUTED}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      )}
    </AnimatedPressable>
  );
}

export function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: colors.SURFACE,
    marginHorizontal: 16,
    marginBottom: 1,
  },
  first: {
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  last: {
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    marginBottom: 0,
  },
  icon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.SURFACE_ALT,
    marginRight: 8,
  },
  label: {
    flex: 1,
    fontSize: 13,
    color: colors.TYPE_PRIMARY,
    fontFamily: "Helvetica Neue",
  },
  value: {
    fontSize: 11,
    color: colors.TYPE_MUTED,
    marginRight: 4,
  },
  sectionHeader: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.TYPE_MUTED,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontFamily: "Helvetica Neue",
  },
});
