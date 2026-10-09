import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, palette, radius, space, touch } from '../theme';
import AppButton from './AppButton';

type Props = {
  visible: boolean;
  initialName: string;
  // Names built from the places the ride went past, so a gloved hand can tap instead of type
  suggestions: string[];
  onSave: (name: string) => void;
  onSkip: () => void;
};

// Asked when a ride stops (and from the ride card), so the crew can find it to follow later
export default function NameRideSheet({ visible, initialName, suggestions, onSave, onSkip }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initialName);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onSkip} onShow={() => setName(initialName)}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <Text style={styles.title} accessibilityRole="header">Name this ride</Text>
          <Text style={styles.hint}>So the crew can pick it out and follow it. You can skip this.</Text>

          {suggestions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
              {suggestions.map((s) => (
                <Pressable key={s} onPress={() => setName(s)} accessibilityRole="button" style={[styles.chip, name === s && styles.chipOn]}>
                  <Text style={[styles.chipText, name === s && styles.chipTextOn]}>{s}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="North pasture via the creek gate"
            placeholderTextColor={colors.textMuted}
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={() => name.trim() && onSave(name)}
            accessibilityLabel="Ride name"
            style={styles.input}
          />

          <View style={styles.actions}>
            <AppButton variant="ghost" title="Skip" onPress={onSkip} style={styles.flex} />
            <AppButton title="Save name" onPress={() => onSave(name)} disabled={!name.trim()} style={styles.flex} />
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
  chips: { gap: space.sm },
  chip: {
    minHeight: touch.min, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.background, justifyContent: 'center',
  },
  chipOn: { backgroundColor: palette.pine, borderColor: palette.pine },
  chipText: { fontSize: 16, fontWeight: '700', color: colors.text },
  chipTextOn: { color: palette.canvas },
  input: {
    minHeight: touch.min, borderWidth: 1, borderColor: colors.input, borderRadius: radius.md, paddingHorizontal: 14,
    fontSize: 17, color: colors.text, backgroundColor: palette.white,
  },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
