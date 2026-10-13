import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { G, Path } from 'react-native-svg';

import { colors, fonts, palette, space } from '../theme';

type Stat = { value: string; label: string; alert?: boolean };

type Props = {
  title: string;
  // Small caps line above the title, like "BOB'S RANCH · TUE OCT 13"
  eyebrow?: string;
  // A button or two on the eyebrow's line
  right?: ReactNode;
  // Big numbers under the title
  stats?: Stat[];
  children?: ReactNode;
};

// The "Field Book" header every tab shares: pine with faint topo contours, a big condensed title,
// and the numbers that matter in large type so they read at arm's length in the sun.
export default function FieldHeader({ title, eyebrow, right, stats, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
      <Contours />
      {(eyebrow || right) && (
        <View style={styles.eyebrowRow}>
          <Text style={styles.eyebrow} numberOfLines={1}>{eyebrow}</Text>
          {right}
        </View>
      )}
      <Text style={styles.title} accessibilityRole="header">{title.toUpperCase()}</Text>
      {stats && stats.length > 0 && (
        <View style={styles.stats}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.stat} accessible accessibilityLabel={`${stat.value} ${stat.label}`}>
              <Text style={[styles.statValue, stat.alert && styles.statAlert]}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      )}
      {children}
    </View>
  );
}

// Drawn, not an image, so it stays crisp at any width and costs nothing offline
export function Contours() {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 390 240" preserveAspectRatio="xMidYMid slice" pointerEvents="none">
      <G fill="none" stroke={palette.harvest} strokeWidth={1} opacity={0.16}>
        <Path d="M-20 40c60-24 120 10 190-6s120-40 230-10" />
        <Path d="M-20 70c60-24 120 14 190-2s120-38 230-8" />
        <Path d="M-20 100c70-20 130 18 196 2s116-34 224-6" />
        <Path d="M-20 160c80-16 140 24 206 8s104-26 214 0" />
        <Path d="M-20 190c80-16 146 26 210 10s100-22 210 4" />
        <Path d="M-20 220c80-14 150 28 214 12s96-20 206 6" />
      </G>
      <Path d="M-20 130c70-20 130 22 200 6s110-30 220-4" fill="none" stroke={palette.harvest} strokeWidth={2} opacity={0.3} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.chrome, paddingHorizontal: space.lg + 4, paddingBottom: 20, gap: 10, overflow: 'hidden' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: 44 },
  eyebrow: { flex: 1, fontFamily: fonts.display, fontSize: 15, letterSpacing: 2.4, color: palette.harvest },
  title: { fontFamily: fonts.displayBlack, fontSize: 58, lineHeight: 56, color: colors.chromeText, includeFontPadding: false },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(245, 239, 224, 0.2)', paddingTop: 12, marginTop: 2 },
  stat: { flex: 1, gap: 2 },
  statValue: { fontFamily: fonts.displayBlack, fontSize: 38, lineHeight: 40, color: colors.chromeText, fontVariant: ['tabular-nums'] },
  statAlert: { color: palette.trail },
  statLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: colors.chromeTextMuted },
});
