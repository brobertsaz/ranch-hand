import { StyleSheet, View } from 'react-native';

import { palette } from '../theme';
import Icon, { type IconName } from './Icon';

type Props = {
  color: string;
  onColor: string;
  icon: IconName;
  synced: boolean;
  selected: boolean;
  // Square for a place that stays put, round for a one-off sighting (as on the design canvas)
  square?: boolean;
};

// Map pin: a color plus an icon, so color is never the only cue.
// A dashed ring means it's still only on this phone.
export default function Pin({ color, onColor, icon, synced, selected, square = false }: Props) {
  const size = selected ? 56 : 40;
  const corner = square ? (selected ? 12 : 8) : size / 2;

  return (
    <View style={styles.target}>
      <View
        style={[
          styles.pin,
          { width: size, height: size, borderRadius: corner, borderWidth: selected ? 4 : 3, backgroundColor: color },
          !synced && styles.unsynced,
          selected && styles.halo,
        ]}
      >
        <Icon name={icon} size={selected ? 26 : 20} color={onColor} strokeWidth={icon === 'plus' ? 2.8 : 2.4} />
      </View>
      {selected && <View style={styles.pointer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  // Finger-sized even for the small pin
  target: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  pin: {
    borderColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
  },
  unsynced: { borderStyle: 'dashed' },
  halo: { shadowColor: palette.trail, shadowOpacity: 0.6, shadowRadius: 8 },
  pointer: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: palette.white,
  },
});
