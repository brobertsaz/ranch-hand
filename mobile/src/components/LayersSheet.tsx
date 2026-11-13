import { useMemo } from 'react';
import { Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MapArea } from '../api';
import { MIN_PACK_SPAN_KM } from '../offline';
import { colors, fonts, palette, radius, space, touch } from '../theme';
import { describeArea, savedKey, type OfflineMaps } from '../useOfflineMaps';
import AppButton from './AppButton';
import Icon from './Icon';

export type MapBase = 'aerial' | 'topo';

type Props = {
  visible: boolean;
  // Has to be the same function from one render to the next: a new one mid-drag would drop the swipe
  onClose: () => void;
  base: MapBase;
  onBase: (base: MapBase) => void;
  offline: OfflineMaps;
  // Only the owner can remove a sharp area (the server agrees)
  isOwner: boolean;
  onShowArea: (area: MapArea) => void;
};

// The Map sheet: aerial or topo, the offline download, and the ranch's sharp areas
export default function LayersSheet({ visible, onClose, base, onBase, offline, isOwner, onShowArea }: Props) {
  const insets = useSafeAreaInsets();
  const { areas, pack, downloading, downloadTarget, savedAreas, sharpening } = offline;
  // Dragging the Map sheet's header down closes it, like a pull-down on any bottom sheet
  const closeOnSwipeDown = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => { if (g.dy > 60 || g.vy > 0.8) onClose(); },
    }),
    [onClose],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* The tap-off area sits behind the sheet, not around it, so it can't swallow the sheet's scrolling */}
      <View style={[styles.backdrop, { paddingTop: insets.top + space.xl }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, styles.sheetShrink]}>
          <View style={styles.sheetHeader} {...closeOnSwipeDown.panHandlers}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle} accessibilityRole="header">Map</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.sheetClose}>
              <Icon name="close" size={24} color={colors.text} strokeWidth={2.4} />
            </Pressable>
          </View>
          {/* Once a ranch has a few sharp areas the sheet outgrows the screen, so the header stays put and the rest scrolls */}
          <ScrollView style={styles.sheetScroll} persistentScrollbar contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + space.xl }]}>
            <View style={styles.baseRow}>
              {(['aerial', 'topo'] as const).map((b) => (
                <Pressable
                  key={b}
                  onPress={() => onBase(b)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: base === b }}
                  style={[styles.baseChoice, base === b && styles.baseChoiceOn]}
                >
                  <Icon name={b === 'aerial' ? 'map' : 'layers'} size={22} color={base === b ? palette.white : colors.text} />
                  <Text style={[styles.baseText, base === b && styles.baseTextOn]}>{b === 'aerial' ? 'Aerial' : 'Topo'}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sheetHint}>
              {base === 'topo' ? 'Contour lines, creeks, draws and section lines.' : 'Aerial photos of the ground.'} Offline areas saved before today need saving again to have Topo.
            </Text>

            <View style={styles.sheetDivider} />
            <Text style={styles.sheetTitle}>Offline map</Text>
            <Text style={styles.sheetText}>{pack}</Text>
            <AppButton
              title={downloading !== null && downloadTarget === 'view' ? `Downloading ${Math.round(downloading)}%` : 'Download this area'}
              onPress={offline.downloadArea}
              disabled={downloading !== null}
              icon={<Icon name="download" size={20} color={palette.white} strokeWidth={2.4} />}
            />
            <Text style={styles.sheetHint}>Saves aerial and topo maps at least {MIN_PACK_SPAN_KM} km across around the current view.</Text>

            <View style={styles.sheetDivider} />
            <Text style={styles.sheetTitle}>Sharp areas</Text>
            {areas.map((area) => (
              <View key={area.id} style={styles.areaRow}>
                <Pressable onPress={() => onShowArea(area)} accessibilityRole="button" accessibilityHint="Shows it on the map" style={{ flex: 1 }}>
                  <Text style={[styles.sheetText, styles.areaName]}>{area.name}</Text>
                  <Text style={styles.sheetHint}>
                    {describeArea(area)}
                    {savedAreas.has(savedKey(area)) ? ' · saved on this phone' : ''}
                  </Text>
                  {area.status === 'rendering' && (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.min(100, (area.tile_count / Math.max(1, area.estimated_tiles)) * 100)}%` }]} />
                    </View>
                  )}
                </Pressable>
                {area.status === 'ready' && (
                  <AppButton
                    variant="secondary"
                    title={downloading !== null && downloadTarget === area.id ? `${Math.round(downloading)}%` : savedAreas.has(savedKey(area)) ? 'Update' : 'Download'}
                    onPress={() => offline.downloadSharpArea(area)}
                    disabled={downloading !== null}
                    icon={<Icon name="download" size={20} color={palette.white} strokeWidth={2.4} />}
                  />
                )}
                {isOwner && (
                  <Pressable onPress={() => offline.confirmRemoveArea(area)} accessibilityRole="button" accessibilityLabel={`Remove ${area.name}`} style={styles.sheetClose}>
                    <Icon name="close" size={20} color={colors.textMuted} strokeWidth={2.4} />
                  </Pressable>
                )}
              </View>
            ))}
            <AppButton
              variant="secondary"
              title={sharpening ? 'Sending…' : 'Sharpen this area'}
              onPress={offline.sharpenView}
              disabled={sharpening}
              icon={<Icon name="plus" size={20} color={palette.white} strokeWidth={2.4} />}
            />
            <Text style={styles.sheetHint}>Gets close-up aerial photos for the current view plus a quarter mile, from the state&apos;s own imagery where it&apos;s sharper. Do it once per pasture, with signal.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: space.xl, paddingHorizontal: space.lg, gap: 10,
  },
  sheetShrink: { flexShrink: 1, paddingBottom: 0 },
  sheetScroll: { flexShrink: 1 },
  sheetBody: { gap: 10, paddingTop: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -space.md },
  grabber: { position: 'absolute', top: -space.sm, alignSelf: 'center', left: '50%', marginLeft: -20, width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  sheetClose: { width: touch.min, height: touch.min, marginRight: -space.md, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
  sheetText: { fontSize: 15, color: colors.text },
  areaName: { fontWeight: '700', textDecorationLine: 'underline' },
  sheetHint: { fontSize: 13, color: colors.textMuted },
  baseRow: { flexDirection: 'row', gap: 10 },
  baseChoice: {
    flex: 1, minHeight: 56, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  baseChoiceOn: { backgroundColor: palette.sky, borderColor: palette.sky },
  baseText: { fontSize: 17, fontWeight: '800', color: colors.text },
  baseTextOn: { color: palette.white },
  sheetDivider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceSunken, overflow: 'hidden', marginTop: 4 },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: palette.sky },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
