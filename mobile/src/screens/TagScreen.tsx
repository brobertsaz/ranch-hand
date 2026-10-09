import type * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '../components/AppButton';
import Icon from '../components/Icon';
import { KINDS, type Kind } from '../db';
import { formatCoords } from '../format';
import { CONDITIONS, KIND_INFO } from '../kinds';
import { colors, fonts, palette, space, sync } from '../theme';

// 'pending' until the first fix comes back; null if none arrived in time
export type Fix = Location.LocationObject | null | 'pending';

// existing: the place nearby; new: save this spot as a new place; none: don't tie it to a place
export type PlaceMode = 'existing' | 'new' | 'none';

type PlaceProps = {
  label: string; // "Water"
  nearby: { name: string; distance: string } | null;
  newName: string; // "Water 3"
  locating: boolean;
  mode: PlaceMode;
  onMode: (mode: PlaceMode) => void;
};

type Props = {
  photoUri: string | null;
  fix: Fix;
  kind: Kind;
  onKind: (kind: Kind) => void;
  place: PlaceProps | null;
  picks: string[];
  onTogglePick: (pick: string) => void;
  tagNumber: string;
  onTagNumber: (value: string) => void;
  note: string;
  onNote: (value: string) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onRetake: () => void;
};

// Mockup 3 · Tag it & save
export default function TagScreen(props: Props) {
  const { photoUri, fix, kind, onKind, place, picks, onTogglePick, tagNumber, onTagNumber, note, onNote, saving, onSave, onCancel, onRetake } = props;
  const conditions = CONDITIONS[kind];
  const insets = useSafeAreaInsets();

  const where =
    fix === 'pending'
      ? { label: 'Finding GPS…', color: sync.pending }
      : fix
        ? { label: `${formatCoords(fix.coords.latitude, fix.coords.longitude)} · ±${Math.round(fix.coords.accuracy ?? 0)} m`, color: sync.synced }
        : { label: 'No GPS fix yet', color: sync.failed };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <View style={[styles.strip, { height: 210 + insets.top }]}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Photo you just took" />
        ) : (
          <View style={styles.noPhoto}>
            <Icon name="camera" size={32} color={colors.chromeTextMuted} />
            <Text style={styles.noPhotoText}>No photo</Text>
          </View>
        )}
        <View style={[styles.stripControls, { top: insets.top + 8 }]}>
          <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.roundButton}>
            <Icon name="close" size={20} color={colors.chromeText} strokeWidth={2.4} />
          </Pressable>
          <Pressable onPress={onRetake} accessibilityRole="button" style={styles.retake}>
            <Text style={styles.retakeText}>{photoUri ? 'Retake' : 'Add photo'}</Text>
          </Pressable>
        </View>
        <View style={styles.coords}>
          <View style={[styles.dot, { backgroundColor: where.color }]} />
          <Text style={styles.coordsText}>{where.label}</Text>
        </View>
      </View>

      <ScrollView style={styles.form} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading} accessibilityRole="header">What did you see?</Text>
        <View style={styles.kinds}>
          {KINDS.map((k) => {
            const info = KIND_INFO[k];
            const on = k === kind;
            return (
              <Pressable
                key={k}
                onPress={() => onKind(k)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.kind, on && styles.kindOn]}
              >
                <Icon name={info.icon} size={26} color={on ? palette.white : info.tint} strokeWidth={info.icon === 'plus' ? 2.6 : 2.2} />
                <Text style={[styles.kindText, on && styles.kindTextOn]}>{info.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.subheading} accessibilityRole="header">{conditions.prompt}</Text>
        <View style={styles.picks}>
          {conditions.options.map((option) => {
            const on = picks.includes(option);
            return (
              <Pressable
                key={option}
                onPress={() => onTogglePick(option)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={[styles.pick, on && styles.pickOn]}
              >
                <View style={[styles.box, on && styles.boxOn]}>
                  {on && <Icon name="check" size={16} color={palette.white} strokeWidth={3} />}
                </View>
                <Text style={[styles.pickText, on && styles.pickTextOn]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>

        {place && <PlacePicker {...place} />}

        <View style={styles.fields}>
          {kind === 'sick_animal' && (
            <View style={styles.tagField}>
              <Text style={styles.label} nativeID="tagLabel">Tag #</Text>
              <TextInput
                accessibilityLabelledBy="tagLabel"
                style={styles.tagInput}
                value={tagNumber}
                onChangeText={onTagNumber}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          )}
          <View style={styles.noteField}>
            <Text style={styles.label} nativeID="noteLabel">
              Anything else? <Text style={styles.optional}>optional</Text>
            </Text>
            <TextInput
              accessibilityLabelledBy="noteLabel"
              style={styles.noteInput}
              value={note}
              onChangeText={onNote}
              placeholder="By the creek…"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.saveBar, { paddingBottom: insets.bottom + space.lg }]}>
        <AppButton
          size="large"
          title={saving ? 'Waiting for GPS…' : 'Drop the pin'}
          onPress={onSave}
          disabled={saving}
          icon={saving ? undefined : <Icon name="check" size={26} color={palette.white} strokeWidth={2.8} />}
        />
        <Text style={styles.caption}>Saved on this phone now. Sends to the crew when you're back in range.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

// Feed, water and gate checks belong to a place that stays put
function PlacePicker({ label, nearby, newName, locating, mode, onMode }: PlaceProps) {
  const lower = label.toLowerCase();
  const options: { mode: PlaceMode; title: string; detail: string }[] = nearby
    ? [
        { mode: 'existing', title: nearby.name, detail: `${nearby.distance} away. Adds this check to its history.` },
        { mode: 'new', title: `A different ${lower} spot`, detail: `Saves here as ${newName}.` },
      ]
    : [{ mode: 'new', title: `Save this spot as ${newName}`, detail: 'So the crew can find it again with Take me there.' }];

  return (
    <View style={styles.placeSection}>
      <Text style={styles.subheading} accessibilityRole="header">Which {lower} spot?</Text>
      {locating ? (
        <Text style={styles.placeDetail}>Finding nearby places…</Text>
      ) : (
        options.map((option) => {
          const on = mode === option.mode;
          return (
            <Pressable
              key={option.mode}
              // With only one option, tapping it again unticks it: log this check without a place
              onPress={() => onMode(on && !nearby ? 'none' : option.mode)}
              accessibilityRole={nearby ? 'radio' : 'checkbox'}
              accessibilityState={nearby ? { selected: on } : { checked: on }}
              style={[styles.place, on && styles.pickOn]}
            >
              <View style={[nearby ? styles.radio : styles.box, on && styles.boxOn]}>
                {on && (nearby ? <View style={styles.radioDot} /> : <Icon name="check" size={16} color={palette.white} strokeWidth={3} />)}
              </View>
              <View style={styles.placeText}>
                <Text style={[styles.pickText, on && styles.pickTextOn]}>{option.title}</Text>
                <Text style={[styles.placeDetail, on && styles.placeDetailOn]}>{option.detail}</Text>
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  strip: { backgroundColor: colors.chrome },
  noPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 40 },
  noPhotoText: { color: colors.chromeTextMuted, fontSize: 15, fontWeight: '600' },
  stripControls: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(16, 23, 19, 0.75)', alignItems: 'center', justifyContent: 'center' },
  retake: { height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: 'rgba(16, 23, 19, 0.75)', justifyContent: 'center' },
  retakeText: { color: colors.chromeText, fontSize: 15, fontWeight: '700' },
  coords: {
    position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(16, 23, 19, 0.82)', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  coordsText: { color: colors.chromeText, fontSize: 13, fontWeight: '600' },
  form: { flex: 1 },
  formContent: { paddingHorizontal: space.lg, paddingTop: 20, paddingBottom: space.lg, gap: 18 },
  heading: { fontFamily: fonts.display, fontSize: 30, lineHeight: 32, color: colors.text, marginBottom: -8 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  kind: {
    flexBasis: '31%', flexGrow: 1, height: 84, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  kindOn: { backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.chrome },
  kindText: { fontSize: 15, fontWeight: '700', color: colors.text },
  kindTextOn: { fontWeight: '800', color: colors.primaryText },
  subheading: { fontFamily: fonts.display, fontSize: 24, lineHeight: 26, color: colors.text, marginBottom: -8 },
  picks: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // Two to a row and 56 tall: big enough for a gloved thumb
  pick: {
    flexBasis: '48%', flexGrow: 1, minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12,
  },
  pickOn: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  boxOn: { borderColor: palette.white },
  pickText: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  pickTextOn: { color: colors.secondaryText },
  placeSection: { gap: space.sm },
  place: {
    minHeight: 64, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  placeText: { flex: 1, gap: 2 },
  placeDetail: { fontSize: 14, color: colors.textMuted },
  placeDetailOn: { color: 'rgba(255, 255, 255, 0.85)' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.white },
  fields: { flexDirection: 'row', gap: 10 },
  tagField: { width: 132, gap: 6 },
  noteField: { flex: 1, gap: 6 },
  label: { fontSize: 14, fontWeight: '700', color: colors.text },
  optional: { fontWeight: '500', color: colors.textMuted },
  tagInput: {
    height: 56, borderRadius: 10, borderWidth: 2, borderColor: colors.chrome, backgroundColor: colors.surface,
    paddingHorizontal: 14, fontFamily: fonts.display, fontSize: 30, color: colors.text,
  },
  noteInput: {
    height: 56, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(23, 27, 24, 0.3)', backgroundColor: colors.surface,
    paddingHorizontal: 14, fontSize: 17, color: colors.text,
  },
  saveBar: {
    paddingTop: 14, paddingHorizontal: space.lg, gap: 10, backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: 'rgba(23, 27, 24, 0.12)',
  },
  caption: { textAlign: 'center', fontSize: 14, color: '#4F554F' },
});
