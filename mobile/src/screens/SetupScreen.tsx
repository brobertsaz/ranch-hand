import { isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ApiError, joinRanch, startRanch, type Joined } from '../api';
import AppButton from '../components/AppButton';
import GoogleMark from '../components/GoogleMark';
import Icon from '../components/Icon';
import Logo from '../components/Logo';
import { canStartRanch, googleIdToken } from '../google';
import { DEFAULT_API_URL, saveDevice, type Device } from '../settings';
import HeadquartersScreen from './HeadquartersScreen';
import { colors, fonts, palette, radius, space, touch } from '../theme';

// Matches Ranch#hand_limit's default on the server.
// shortcut: the "ranch is full" message assumes the free limit, upgrade to reading hand_limit from the 403 body once paid plans exist
const FREE_HANDS = 3;

type Mode = 'welcome' | 'start' | 'join';

// The first screen: the brand up top, then two ways in. Owners start a ranch with Google (free for them and
// up to 3 hands); hands join with the code the owner shares from the Crew tab. The server address hides
// behind a link since testers never need to change it.
export default function SetupScreen({ onJoined }: { onJoined: (device: Device) => void }) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>(canStartRanch ? 'welcome' : 'join');
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [showServer, setShowServer] = useState(false);
  const [ranchName, setRanchName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A new owner, signed in but not on the map yet: they set headquarters first
  const [placing, setPlacing] = useState<Device | null>(null);

  // Android's back button steps back to the two choices instead of closing the app
  useEffect(() => {
    if (mode === 'welcome') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      go('welcome');
      return true;
    });
    return () => sub.remove();
  }, [mode]);

  function go(next: Mode) {
    setError(null);
    setMode(next);
  }

  function toDevice(url: string, result: Joined): Device {
    return { apiUrl: url, token: result.token, memberId: result.member_id, ranchName: result.ranch.name };
  }

  async function finish(device: Device) {
    await saveDevice(device);
    onJoined(device);
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const idToken = await googleIdToken();
      if (!idToken) return;
      const url = serverUrl();
      const result = await startRanch(url, idToken, ranchName.trim());
      // A returning owner who already set headquarters goes straight to the map
      if (result.ranch.headquarters) await finish(toDevice(url, result));
      else setPlacing(toDevice(url, result));
    } catch (e) {
      if (isErrorWithCode(e) && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError('Google sign-in needs Google Play services on this phone.');
      } else if (e instanceof ApiError) {
        setError(e.status === 401 ? "Google didn't vouch for that account. Try again, or pick another." : `The server had a problem (${e.status}). Try again in a minute.`);
      } else {
        setError("Can't reach Google or the server. Starting a ranch needs signal once; after that the app works without it.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const url = serverUrl();
      await finish(toDevice(url, await joinRanch(url, inviteCode, name.trim())));
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 404
            ? "That code didn't match a ranch. Check it with whoever sent it."
            : e.status === 403
              ? `That ranch already has its ${FREE_HANDS} hands on the free plan. Let the owner know.`
              : `The server had a problem (${e.status}). Try again in a minute.`
          : "Can't reach the server. Joining needs signal once; after that the app works without it.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (placing) return <HeadquartersScreen device={placing} onDone={() => finish(placing)} />;

  function serverUrl() {
    return apiUrl.trim().replace(/\/+$/, '');
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, mode !== 'welcome' && styles.heroCompact, { paddingTop: insets.top + (mode === 'welcome' ? 56 : space.xl) }]}>
          <Contours />
          <Logo size={mode === 'welcome' ? 104 : 64} />
          <Text style={[styles.wordmark, mode !== 'welcome' && styles.wordmarkCompact]} accessibilityRole="header">
            RANCH HAND
          </Text>
          {mode === 'welcome' && (
            <>
              <Text style={styles.tagline}>Log what you see on the ranch. The whole crew sees it, even out where there’s no signal.</Text>
              {/* Ear-tag yellow, like the invite card on the Crew tab */}
              <View style={styles.badge}>
                <Text style={styles.badgeText}>FREE · UP TO {FREE_HANDS} HANDS</Text>
              </View>
            </>
          )}
        </View>

        <View style={[styles.panel, { paddingBottom: insets.bottom + space.xl }]}>
          {mode !== 'welcome' && canStartRanch && (
            <Pressable onPress={() => go('welcome')} accessibilityRole="button" style={styles.back} hitSlop={8}>
              <Icon name="back" size={18} color={colors.textMuted} strokeWidth={2.4} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          )}

          {mode === 'welcome' && (
            <>
              <Choice
                variant="start"
                title="Start a ranch"
                detail={`For the owner or manager. Free for you and ${FREE_HANDS} hands.`}
                onPress={() => go('start')}
              />
              <Choice variant="join" title="Join a ranch" detail="Got an invite code from the boss? Start here." onPress={() => go('join')} />
            </>
          )}

          {mode === 'start' && (
            <>
              <Text style={styles.title}>Start your ranch</Text>

              <Text style={styles.label} nativeID="ranch-label">Ranch name</Text>
              <TextInput
                style={styles.input}
                value={ranchName}
                onChangeText={setRanchName}
                autoCapitalize="words"
                placeholder="Bar T Cattle Co."
                placeholderTextColor={colors.placeholder}
                accessibilityLabelledBy="ranch-label"
                maxLength={100}
              />
              <Text style={styles.hint}>Already started one? Leave this blank and sign in. You’ll land back on your ranch.</Text>

              <View style={styles.perks}>
                <Perk text={`You plus up to ${FREE_HANDS} working hands, free`} />
                <Perk text="Works out where there's no signal" />
                <Perk text="Hands join with a code, no account needed" />
              </View>

              {error && <ErrorBox text={error} />}

              <Pressable
                onPress={start}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                style={({ pressed }) => [styles.google, pressed && styles.pressed, busy && styles.disabled]}
              >
                <GoogleMark size={22} />
                <Text style={styles.googleText}>{busy ? 'Signing in…' : 'Continue with Google'}</Text>
              </Pressable>
              <Text style={styles.fine}>Google only signs you in. We never post or read your mail.</Text>
            </>
          )}

          {mode === 'join' && (
            <>
              <Text style={styles.title}>Join your ranch</Text>

              <Text style={styles.label} nativeID="code-label">Invite code</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={inviteCode}
                onChangeText={(text) => setInviteCode(text.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="K7PQ2M"
                placeholderTextColor={colors.placeholder}
                accessibilityLabelledBy="code-label"
              />
              <Text style={styles.hint}>The ranch owner finds it on their Crew tab.</Text>

              <Text style={styles.label} nativeID="name-label">Your name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                placeholder="What the crew calls you"
                placeholderTextColor={colors.textMuted}
                accessibilityLabelledBy="name-label"
                returnKeyType="go"
                onSubmitEditing={() => inviteCode && name.trim() && join()}
              />

              {error && <ErrorBox text={error} />}

              <AppButton
                size="large"
                title={busy ? 'Joining…' : 'Join the crew'}
                onPress={join}
                disabled={busy || !inviteCode || !name.trim()}
                style={{ marginTop: space.md }}
              />
            </>
          )}

          <Pressable onPress={() => setShowServer((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showServer }} style={styles.serverToggle}>
            <Text style={styles.serverToggleText}>Server settings</Text>
            <Icon name="chevronRight" size={16} color={colors.textMuted} strokeWidth={2.4} />
          </Pressable>
          {showServer && (
            <TextInput
              style={styles.input}
              value={apiUrl}
              onChangeText={setApiUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              accessibilityLabel="Server address"
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Choice({ variant, title, detail, onPress }: { variant: 'start' | 'join'; title: string; detail: string; onPress: () => void }) {
  const start = variant === 'start';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={detail}
      style={({ pressed }) => [styles.choice, start ? styles.choiceStart : styles.choiceJoin, pressed && styles.pressed]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.choiceTitle, start && { color: palette.white }]}>{title}</Text>
        <Text style={[styles.choiceDetail, start && { color: 'rgba(255, 255, 255, 0.86)' }]}>{detail}</Text>
      </View>
      <Icon name="chevronRight" size={26} color={start ? palette.white : colors.text} strokeWidth={2.6} />
    </Pressable>
  );
}

function Perk({ text }: { text: string }) {
  return (
    <View style={styles.perk}>
      <Icon name="check" size={18} color={colors.stampDone} strokeWidth={3} />
      <Text style={styles.perkText}>{text}</Text>
    </View>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <View style={styles.error} accessibilityLiveRegion="polite">
      <Text style={styles.errorText}>{text}</Text>
    </View>
  );
}

// Topo lines behind the brand, like the contour layer on a USGS quad: one hill off the top right corner, with
// every fifth line heavier the way index contours are. Built from a few sine waves, so there's no image to ship.
const CONTOURS = Array.from({ length: 16 }, (_, ring) => {
  const r = 28 + ring * 22;
  const points = Array.from({ length: 96 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2;
    const wobble = 1 + 0.1 * Math.sin(3 * a + ring * 0.35) + 0.06 * Math.sin(5 * a + 1.3) + 0.03 * Math.sin(9 * a + ring);
    return `${(330 + Math.cos(a) * r * wobble).toFixed(1)} ${(70 + Math.sin(a) * r * wobble * 0.78).toFixed(1)}`;
  });
  return { d: `M${points.join('L')}Z`, index: ring % 5 === 4 };
});

function Contours() {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 420" preserveAspectRatio="xMidYMid slice" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {CONTOURS.map(({ d, index }, i) => (
        <Path key={i} d={d} fill="none" stroke={palette.canvas} strokeOpacity={index ? 0.13 : 0.06} strokeWidth={index ? 1.6 : 1} />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: {
    backgroundColor: palette.pine, alignItems: 'center', paddingHorizontal: space.xl, paddingBottom: 40, gap: space.md, overflow: 'hidden',
  },
  heroCompact: { flexDirection: 'row', justifyContent: 'center', paddingBottom: space.xl },
  wordmark: { fontFamily: fonts.displayBlack, fontSize: 60, lineHeight: 62, letterSpacing: 0.5, color: palette.canvas, marginTop: space.sm },
  wordmarkCompact: { fontSize: 40, lineHeight: 44, marginTop: 0 },
  tagline: { fontSize: 17, lineHeight: 24, color: colors.chromeTextMuted, textAlign: 'center', maxWidth: 320 },
  badge: { backgroundColor: palette.harvest, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6, marginTop: space.sm },
  badgeText: { fontFamily: fonts.displayBlack, fontSize: 17, letterSpacing: 1.6, color: palette.pine },
  panel: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.sm },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 32, marginBottom: space.xs },
  backText: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
  choice: { minHeight: 96, borderRadius: radius.lg, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  choiceStart: { backgroundColor: colors.primary },
  choiceJoin: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  choiceTitle: { fontFamily: fonts.display, fontSize: 30, color: colors.text },
  choiceDetail: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.textMuted },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.text, marginBottom: space.sm },
  label: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3, color: colors.text, marginTop: space.sm },
  input: {
    minHeight: touch.min, borderWidth: 1, borderColor: colors.input, borderRadius: radius.md, paddingHorizontal: 14,
    backgroundColor: colors.surface, color: colors.text, fontSize: 17,
  },
  codeInput: { fontFamily: fonts.displayBlack, fontSize: 30, letterSpacing: 2, minHeight: 60 },
  hint: { fontSize: 13, color: colors.textMuted },
  perks: { backgroundColor: colors.surfaceSunken, borderRadius: radius.lg, padding: space.lg, gap: space.sm, marginVertical: space.md },
  perk: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  perkText: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  google: {
    minHeight: touch.primary, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: palette.white, borderWidth: 1, borderColor: 'rgba(23, 27, 24, 0.22)',
  },
  googleText: { fontSize: 18, fontWeight: '700', color: '#1F1F1F' },
  fine: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: space.xs },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
  error: { backgroundColor: colors.dangerBackground, borderRadius: radius.md, padding: 12, marginVertical: space.sm },
  errorText: { color: palette.destructive, fontSize: 15, fontWeight: '600' },
  serverToggle: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: space.sm },
  serverToggleText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
});
