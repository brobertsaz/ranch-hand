import { StyleSheet, Text } from 'react-native';

import { fonts, palette } from '../theme';

type Tone = 'open' | 'done' | 'clear';

const TONES: Record<Tone, string> = {
  open: palette.trailDark,
  // Darker than the synced green so it holds 4.5:1 on canvas and card
  done: '#3B6E4A',
  clear: palette.sky,
};

// A rubber-stamp status: outlined, condensed caps, a few degrees off true, like a tally book entry.
// The word carries the meaning, so it reads without the color.
export default function Stamp({ label, tone, tilt = -3 }: { label: string; tone: Tone; tilt?: number }) {
  const color = TONES[tone];
  return <Text style={[styles.stamp, { color, borderColor: color, transform: [{ rotate: `${tilt}deg` }] }]}>{label.toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  stamp: { fontFamily: fonts.display, fontSize: 14, letterSpacing: 1.4, borderWidth: 2, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 0, overflow: 'hidden' },
});
