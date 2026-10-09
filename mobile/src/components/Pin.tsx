import { StyleSheet, View } from 'react-native';

import type { Kind } from '../db';
import { KIND_INFO } from '../kinds';
import { palette } from '../theme';
import Icon from './Icon';

type Props = { kind: Kind; synced: boolean; selected: boolean };

// Map pin: kind color plus an icon, so color is never the only cue.
// A dashed ring means it's still only on this phone.
export default function Pin({ kind, synced, selected }: Props) {
  const info = KIND_INFO[kind];
  const size = selected ? 56 : 40;

  return (
    <View style={styles.target}>
      <View
        style={[
          styles.pin,
          { width: size, height: size, borderRadius: size / 2, borderWidth: selected ? 4 : 3, backgroundColor: info.pinColor },
          !synced && styles.unsynced,
          selected && styles.halo,
        ]}
      >
        <Icon name={info.icon} size={selected ? 26 : 20} color={info.onColor} strokeWidth={info.icon === 'plus' ? 2.8 : 2.4} />
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
