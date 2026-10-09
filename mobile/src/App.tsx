import { BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed/800ExtraBold';
import { BarlowCondensed_900Black } from '@expo-google-fonts/barlow-condensed/900Black';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { db } from './db';
import MapScreen from './screens/MapScreen';
import SetupScreen from './screens/SetupScreen';
import { loadDevice, type Device } from './settings';
import { colors } from './theme';

export default function App() {
  const [device, setDevice] = useState<Device | null | undefined>(undefined);
  // Only the two weights theme.ts names, so the rest of the family stays out of the bundle
  const [fontsLoaded, fontError] = useFonts({ BarlowCondensed_800ExtraBold, BarlowCondensed_900Black });

  useEffect(() => {
    db();
    loadDevice().then(setDevice);
  }, []);

  // A font that fails to load falls back to the system face rather than blocking the app
  if (device === undefined || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* Android dark mode otherwise paints the window dark under our dark text */}
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {device ? <MapScreen device={device} onSignOut={() => setDevice(null)} /> : <SetupScreen onJoined={setDevice} />}
      </View>
    </SafeAreaProvider>
  );
}
