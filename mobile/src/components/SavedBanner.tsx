import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, palette, radius, shadow, space, textSize } from '../theme';
import Icon from './Icon';

type Props = {
  // Changes on every save, so a second pin dropped while the banner is still up restarts its clock
  savedAt: number;
  online: boolean;
  bottom: number;
  onHide: () => void;
};

const SHOW_MS = 3500;

// The end of the capture flow: the pin is safe on the phone, and whether it's on its way to the crew.
// A fade only (no slide), so it's the same with Reduce Motion on.
export default function SavedBanner({ savedAt, online, bottom, onHide }: Props) {
  const [opacity] = useState(() => new Animated.Value(0));
  const detail = online ? 'Sending to the crew now.' : 'Sends to the crew when you’re back in range.';

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`Pin saved on this phone. ${detail}`);
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 240, useNativeDriver: true }).start(({ finished }) => finished && onHide());
    }, SHOW_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per save; detail and onHide don't restart it
  }, [savedAt]);

  return (
    <Animated.View style={[styles.wrap, { bottom, opacity }]}>
      <Pressable onPress={onHide} accessibilityRole="button" accessibilityLabel="Pin saved. Dismiss" style={styles.banner}>
        <View style={styles.check}>
          <Icon name="check" size={22} color={colors.successText} strokeWidth={3} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>Pin saved on this phone</Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  banner: {
    ...shadow, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: colors.chrome, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.success,
  },
  check: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 24, color: palette.canvas },
  detail: { fontSize: textSize.meta, color: colors.chromeTextMuted },
});
