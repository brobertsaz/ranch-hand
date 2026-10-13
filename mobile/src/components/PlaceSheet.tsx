import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WAYPOINT_KINDS, type WaypointKind } from '../db';
import { WAYPOINT_INFO } from '../kinds';
import { colors, fonts, palette, radius, space, touch } from '../theme';
import AppButton from './AppButton';
import Icon from './Icon';

export type PlaceFields = { kind: WaypointKind; name: string; note: string | null };

type Props = {
  visible: boolean;
  title: string;
  initial: PlaceFields;
  // New places get "Gate 4" for free; picking another kind swaps it, unless the hand typed their own
  autoName?: (kind: WaypointKind) => string;
  // "Where you're standing · ±4 m", or why it can't save yet
  where?: string;
  canSave?: boolean;
  saveTitle?: string;
  // Hands back what's filled in so far, so nothing is lost on the way to the map
  extra?: { title: string; onPress: (draft: PlaceFields) => void };
  onSave: (fields: PlaceFields) => void;
  onCancel: () => void;
};

// Adding or editing a place that stays put. Kind is one tap; the name is filled in, so typing is optional.
export default function PlaceSheet({ visible, title, initial, autoName, where, canSave = true, saveTitle = 'Save place', extra, onSave, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState(initial.kind);
  const [name, setName] = useState(initial.name);
  const [note, setNote] = useState(initial.note ?? '');

  function reset() {
    setKind(initial.kind);
    setName(initial.name);
    setNote(initial.note ?? '');
  }

  const fields = (): PlaceFields => ({ kind, name: name.trim(), note: note.trim() || null });

  function pickKind(next: WaypointKind) {
    if (autoName && name === autoName(kind)) setName(autoName(next));
    setKind(next);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel} onShow={reset}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {where && <Text style={styles.hint}>{where}</Text>}

          <View style={styles.kinds} accessibilityRole="radiogroup" accessibilityLabel="Kind of place">
            {WAYPOINT_KINDS.map((k) => {
              const info = WAYPOINT_INFO[k];
              const on = k === kind;
              return (
                <Pressable
                  key={k}
                  onPress={() => pickKind(k)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={info.label}
                  style={[styles.kind, on && styles.kindOn]}
                >
                  <View style={[styles.kindIcon, { backgroundColor: info.color }]}>
                    <Icon name={info.icon} size={20} color={info.onColor} strokeWidth={2.4} />
                  </View>
                  <Text style={[styles.kindLabel, on && styles.kindLabelOn]} numberOfLines={1}>{info.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Creek gate"
            placeholderTextColor={colors.textMuted}
            maxLength={60}
            returnKeyType="next"
            accessibilityLabel="Name"
            style={styles.input}
          />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional): chain latch, opens east"
            placeholderTextColor={colors.textMuted}
            maxLength={280}
            accessibilityLabel="Note"
            style={styles.input}
          />

          {extra && <AppButton variant="ghost" title={extra.title} onPress={() => extra.onPress(fields())} icon={<Icon name="map" size={20} color={colors.text} />} />}
          <View style={styles.actions}>
            <AppButton variant="ghost" title="Cancel" onPress={onCancel} style={styles.flex} />
            <AppButton
              title={saveTitle}
              onPress={() => onSave(fields())}
              disabled={!canSave || !name.trim()}
              style={styles.flex}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: space.xl, paddingHorizontal: space.lg, gap: 12,
  },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.text },
  hint: { fontSize: 15, color: colors.textMuted },
  kinds: { flexDirection: 'row', gap: 6 },
  kind: {
    flex: 1, minHeight: touch.min + 8, borderRadius: 12, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6,
  },
  kindOn: { backgroundColor: palette.pine, borderColor: palette.pine },
  kindIcon: { width: 32, height: 32, borderRadius: 6, borderWidth: 2, borderColor: palette.white, alignItems: 'center', justifyContent: 'center' },
  kindLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  kindLabelOn: { color: palette.canvas, fontWeight: '800' },
  input: {
    minHeight: touch.min, borderWidth: 1, borderColor: colors.input, borderRadius: radius.md, paddingHorizontal: 14,
    fontSize: 17, color: colors.text, backgroundColor: colors.inputBackground,
  },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
