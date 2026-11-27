import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, palette, radius, shadow, touch } from '../theme';

// A pill over the map: one of the pins sharing a spot with the one selected
export default function Chip({ label, color, on, onPress }: { label: string; color?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
      {color && <View style={[styles.chipDot, { backgroundColor: color }]} />}
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    ...shadow, minHeight: touch.min, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.chromeScrim,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  // Same size on and off, so picking a filter doesn't nudge the row
  chipOn: { backgroundColor: palette.canvas },
  chipDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: palette.white },
  chipText: { color: colors.chromeText, fontSize: 15, fontWeight: '700' },
  chipTextOn: { color: palette.pine },
});
