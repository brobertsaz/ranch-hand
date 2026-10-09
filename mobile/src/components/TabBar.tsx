import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, palette } from '../theme';
import Icon, { type IconName } from './Icon';

export type Tab = 'map' | 'rides' | 'new' | 'crew';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'map', label: 'Map', icon: 'map' },
  { key: 'rides', label: 'Rides', icon: 'rides' },
  { key: 'new', label: 'New', icon: 'bell' },
  { key: 'crew', label: 'Crew', icon: 'crew' },
];

const BAR_HEIGHT = 72;
const CAMERA_SIZE = 80;

export function useTabBarHeight() {
  return BAR_HEIGHT + useSafeAreaInsets().bottom;
}

// badges: unread counts by tab, drawn as the red bubble from the design canvas
type Props = { active: Tab; onChange: (tab: Tab) => void; onCapture: () => void; badges?: Partial<Record<Tab, number>> };

export default function TabBar({ active, onChange, onCapture, badges = {} }: Props) {
  const height = useTabBarHeight();
  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];

  const renderTab = ({ key, label, icon }: (typeof TABS)[number]) => {
    const on = key === active;
    const count = badges[key] ?? 0;
    return (
      <Pressable
        key={key}
        onPress={() => onChange(key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={count > 0 ? `${label}, ${count} new` : label}
        style={styles.tab}
      >
        <Icon name={icon} color={on ? palette.focus : colors.chromeTextMuted} />
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
          </View>
        )}
        <Text style={[styles.label, on && styles.labelOn]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { height }]} accessibilityRole="tablist">
      {left.map(renderTab)}
      <View style={styles.cameraSlot}>
        <Pressable onPress={onCapture} accessibilityRole="button" accessibilityLabel="Log an observation" style={styles.camera}>
          <Icon name="camera" size={34} color={palette.white} strokeWidth={2.2} />
        </Pressable>
      </View>
      {right.map(renderTab)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.chrome,
  },
  tab: { flex: 1, height: 60, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontSize: 12, fontWeight: '600', color: colors.chromeTextMuted },
  labelOn: { fontWeight: '700', color: colors.chromeText },
  badge: {
    position: 'absolute', top: 2, right: '22%', minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: palette.trail, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: palette.white, fontSize: 11, fontWeight: '800' },
  cameraSlot: { width: 96, alignItems: 'center' },
  camera: {
    width: CAMERA_SIZE,
    height: CAMERA_SIZE,
    marginTop: -CAMERA_SIZE / 2,
    borderRadius: CAMERA_SIZE / 2,
    borderWidth: 5,
    borderColor: colors.chrome,
    backgroundColor: palette.trail,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: palette.trail,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
});
