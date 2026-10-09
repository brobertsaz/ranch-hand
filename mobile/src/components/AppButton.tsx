import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, palette, radius, touch } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'chrome';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: Variant;
  // large: the one main action on a screen, in the display face
  size?: 'default' | 'large';
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

// Stands in for RN's <Button>, which can only take a single color
export default function AppButton({ title, onPress, disabled, variant = 'primary', size = 'default', icon, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.base, size === 'large' && styles.large, styles[variant], pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      {icon}
      <Text style={[styles.label, size === 'large' && styles.largeLabel, labelStyles[variant]]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.min,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: { minHeight: touch.primary, borderRadius: 12, gap: 10 },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.secondary },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.input },
  chrome: { backgroundColor: colors.chromeRaised, borderWidth: 1, borderColor: 'rgba(245, 239, 224, 0.2)' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
  label: { fontSize: 17, fontWeight: '700' },
  largeLabel: { fontFamily: fonts.display, fontWeight: undefined, fontSize: 26, letterSpacing: 0.26 },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.primaryText },
  secondary: { color: colors.secondaryText },
  ghost: { color: colors.text },
  chrome: { color: palette.canvas },
});
