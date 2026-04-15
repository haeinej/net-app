import { View, StyleSheet, useWindowDimensions } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { GridCard } from "./GridCard";
import { AnimatedPressable } from "../ui/AnimatedPressable";
import { motion } from "../../theme";

export interface GridItem {
  id: string;
  sentence: string;
  keywords?: string[];
  background?: "warm" | "black" | "white" | { photo: string };
  authorName?: string;
  authorColor?: string;
  synced?: boolean;
}

interface PuzzleGridProps {
  items: GridItem[];
  showAuthors?: boolean;
  numColumns?: number;
  onItemPress?: (id: string) => void;
}

export function PuzzleGrid({
  items,
  showAuthors = false,
  numColumns = 2,
  onItemPress,
}: PuzzleGridProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const gap = numColumns === 2 ? 6 : 5;
  const padding = numColumns === 2 ? 8 : 6;

  const handlePress = (id: string) => {
    if (onItemPress) onItemPress(id);
    else router.push(`/thought/${id}`);
  };

  // Split items into columns for masonry effect
  const columns: GridItem[][] = Array.from({ length: numColumns }, () => []);
  items.forEach((item, i) => {
    columns[i % numColumns].push(item);
  });

  return (
    <View style={[styles.container, { paddingHorizontal: padding }]}>
      {columns.map((column, colIndex) => (
        <View
          key={colIndex}
          style={[
            styles.column,
            colIndex < numColumns - 1 ? { marginRight: gap } : undefined,
          ]}
        >
          {column.map((item, itemIndex) => (
            <Animated.View
              key={item.id}
              entering={FadeIn.delay((colIndex * column.length + itemIndex) * motion.staggerDelay).duration(250).springify().damping(18)}
            >
            <AnimatedPressable style={{ marginBottom: gap }} onPress={() => handlePress(item.id)} activeScale={0.96}>
              <GridCard
                sentence={item.sentence}
                keywords={item.keywords}
                background={item.background}
                authorName={item.authorName}
                authorColor={item.authorColor}
                showAuthor={showAuthors}
                synced={item.synced}
                index={colIndex * 10 + itemIndex}
              />
            </AnimatedPressable>
            </Animated.View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
  },
  column: {
    flex: 1,
  },
});
