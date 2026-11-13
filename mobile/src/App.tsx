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
import { fetchRanch } from './api';
import { loadDevice, saveDevice, type Device } from './settings';
import { colors } from './theme';

export default function App() {
  const [device, setDevice] = useState<Device | null | undefined>(undefined);
  // Only the two weights theme.ts names, so the rest of the family stays out of the bundle
  const [fontsLoaded, fontError] = useFonts({ BarlowCondensed_800ExtraBold, BarlowCondensed_900Black });

  // Why the app is back on the setup screen when it shouldn't be
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    db();
    // A saved sign-in that can't be read (a corrupt or locked keystore) would leave the spinner up forever
    loadDevice()
      .then(setDevice)
      .catch(() => {
        setNotice("Couldn't read this phone's saved sign-in. Join again to get back on your ranch.");
        setDevice(null);
      });
  }, []);

  // The ranch name is saved at join; pick up a rename once there's signal
  useEffect(() => {
    if (!device) return;
    fetchRanch(device)
      .then((ranch) => {
        // The map key too: a phone that joined before map keys has none, and without it the map loses its sharp areas
        const mapKey = ranch.map_key ?? device.mapKey;
        if (ranch.name === device.ranchName && mapKey === device.mapKey) return;
        const next = { ...device, ranchName: ranch.name, mapKey };
        saveDevice(next);
        setDevice(next);
      })
      .catch(() => {}); // offline: keep the saved name
  }, [device]);

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
      <StatusBar style={colors.statusBar} />
      {/* Android dark mode otherwise paints the window dark under our dark text */}
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {device ? <MapScreen device={device} onSignOut={() => setDevice(null)} /> : <SetupScreen notice={notice} onJoined={(joined) => { setNotice(null); setDevice(joined); }} />}
      </View>
    </SafeAreaProvider>
  );
}
