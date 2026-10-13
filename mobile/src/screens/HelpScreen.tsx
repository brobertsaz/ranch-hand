import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../components/Icon';
import { HELP } from '../help';
import { colors, fonts, palette, radius, space, touch } from '../theme';

// How-tos and what the app's pins and labels mean. One topic open at a time keeps the list short to scroll with gloves on.
export default function HelpScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back to map" style={styles.back}>
          <Icon name="back" size={22} color={colors.chromeText} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">Help</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}>
        {HELP.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">{section.title}</Text>
            <View style={styles.card}>
              {section.topics.map((topic, i) => {
                const key = `${section.title}/${topic.title}`;
                const expanded = open === key;
                return (
                  <View key={key} style={i > 0 && styles.divider}>
                    <Pressable
                      onPress={() => setOpen(expanded ? null : key)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      style={styles.topicRow}
                    >
                      <Text style={styles.topicTitle}>{topic.title}</Text>
                      <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
                        <Icon name="chevronRight" size={20} color={colors.textMuted} strokeWidth={2.4} />
                      </View>
                    </Pressable>
                    {expanded && (
                      <View style={styles.answer}>
                        {topic.body && <Text style={styles.text}>{topic.body}</Text>}
                        {topic.steps?.map((step, n) => (
                          <View key={step} style={styles.step}>
                            <Text style={styles.stepNumber}>{n + 1}</Text>
                            <Text style={[styles.text, styles.flex]}>{step}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.chrome, paddingHorizontal: space.lg, paddingBottom: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: { width: touch.round, height: touch.round, borderRadius: touch.round / 2, backgroundColor: colors.chromeRaised, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.displayBlack, fontSize: 36, color: colors.chromeText },
  body: { padding: space.lg, gap: space.xl },
  section: { gap: space.sm },
  sectionTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  topicRow: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingHorizontal: space.lg },
  topicTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  answer: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm },
  text: { fontSize: 16, lineHeight: 23, color: colors.text },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stepNumber: {
    width: 26, height: 26, borderRadius: 13, overflow: 'hidden', backgroundColor: palette.sky, color: palette.white,
    textAlign: 'center', lineHeight: 26, fontSize: 14, fontWeight: '800', marginTop: -1,
  },
  flex: { flex: 1 },
});
