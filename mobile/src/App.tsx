import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { db } from './db';
import MapScreen from './screens/MapScreen';
import SetupScreen from './screens/SetupScreen';
import { loadDevice, type Device } from './settings';

export default function App() {
  const [device, setDevice] = useState<Device | null | undefined>(undefined);

  useEffect(() => {
    db();
    loadDevice().then(setDevice);
  }, []);

  if (device === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* Android dark mode otherwise paints the window dark under our dark text */}
      <View style={{ flex: 1, backgroundColor: 'white' }}>
        {device ? <MapScreen device={device} onSignOut={() => setDevice(null)} /> : <SetupScreen onJoined={setDevice} />}
      </View>
    </SafeAreaProvider>
  );
}
