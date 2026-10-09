import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon, { type IconName } from '../components/Icon';
import { useTabBarHeight } from '../components/TabBar';
import { colors, fonts, space } from '../theme';

type Props = { title: string; icon: IconName; body: string };

// Placeholder for tabs whose features come in later phases (see PLAN.md)
export default function StubScreen({ title, icon, body }: Props) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.xl, paddingBottom: tabBarHeight + space.xl }]}>
      <StatusBar style="dark" />
      <Icon name={icon} size={40} color={colors.textMuted} />
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    gap: space.md,
  },
  title: { fontFamily: fonts.display, fontSize: 36, color: colors.text },
  body: { fontSize: 17, lineHeight: 24, color: colors.text, textAlign: 'center' },
});
