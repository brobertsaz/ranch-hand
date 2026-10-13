import { StyleSheet, Text } from 'react-native';

import { colors, fonts } from '../theme';

type Tone = 'open' | 'done' | 'clear';

const TONES: Record<Tone, string> = { open: colors.stampOpen, done: colors.stampDone, clear: colors.stampClear };

// A rubber-stamp status: outlined, condensed caps, a few degrees off true, like a tally book entry.
// The word carries the meaning, so it reads without the color.
export default function Stamp({ label, tone, tilt = -3 }: { label: string; tone: Tone; tilt?: number }) {
  const color = TONES[tone];
  return <Text style={[styles.stamp, { color, borderColor: color, transform: [{ rotate: `${tilt}deg` }] }]}>{label.toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  stamp: { fontFamily: fonts.display, fontSize: 14, letterSpacing: 1.4, borderWidth: 2, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 0, overflow: 'hidden' },
});
