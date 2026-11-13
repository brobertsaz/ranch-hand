import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { forgetPushToken, registerPushToken } from './api';
import { getState, setState } from './db';
import type { Device } from './settings';

// "Sick animal · Tag 1147 · Jess" on the lock screen, so the handoff doesn't wait for someone to open the app.
// The server sends straight to Google (FCM) and Apple (APNs); this phone tells it its own token for that.

// iPhone builds only carry the push entitlement once the Apple developer account is paid for (see app.config.js)
export const pushAvailable = Platform.OS === 'android' || process.env.EXPO_PUBLIC_APPLE_ENTITLEMENTS === '1';

// What the server last heard from this phone, as "<device token>|<push token>": a new membership or a new
// push token both mean telling it again
const REGISTERED_KEY = 'push_registered';
// Android sorts notifications into channels the hand can silence one by one; the server names this one
const CHANNEL = 'crew';

if (pushAvailable) {
  // With the app open, still show it: the hand may be on another screen, and the sync it sets off takes a moment
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

// Asks to send notifications (once; the phone remembers a no) and tells the server where they go. Quietly does
// nothing when it can't: a hand who said no, or a build with no Firebase project behind it yet.
export async function registerForPush(device: Device): Promise<void> {
  if (!pushAvailable) return;
  try {
    if (Platform.OS === 'android') {
      // Android 13 only shows its permission prompt once the app has a channel
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Crew news', importance: Notifications.AndroidImportance.HIGH });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return;

    const token = await Notifications.getDevicePushTokenAsync();
    if (token.type !== 'android' && token.type !== 'ios') return;
    await tellServer(device, token.type, token.data);
  } catch {
    // No Firebase project, no signal, or the server said no: the next launch tries again
  }
}

async function tellServer(device: Device, platform: 'android' | 'ios', token: string): Promise<void> {
  const registered = `${device.token}|${token}`;
  if ((await getState(REGISTERED_KEY)) === registered) return;
  await registerPushToken(device, platform, token);
  await setState(REGISTERED_KEY, registered);
}

// Leaving the ranch on this phone: stop its notifications. Best effort, and quick, like leaving itself.
export async function unregisterFromPush(device: Device): Promise<void> {
  if (!pushAvailable) return;
  await forgetPushToken(device).catch(() => {});
}

type Handlers = {
  // A notification arrived with the app open: go and get what it's about
  onNews: () => void;
  // The hand tapped a notification about this observation
  onOpen: (observationId: string) => void;
};

export function usePush(device: Device, handlers: Handlers): void {
  // The newest handlers without subscribing again on every render
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!pushAvailable) return;
    registerForPush(device);

    const open = (response: Notifications.NotificationResponse | null) => {
      const id = response?.notification.request.content.data?.observation_id;
      if (typeof id === 'string') latest.current.onOpen(id);
    };
    // The tap that started the app, then any tap while it's running
    open(Notifications.getLastNotificationResponse());
    Notifications.clearLastNotificationResponse();
    const taps = Notifications.addNotificationResponseReceivedListener(open);
    const arrivals = Notifications.addNotificationReceivedListener(() => latest.current.onNews());
    // Google and Apple hand out a new token now and then
    const tokens = Notifications.addPushTokenListener((token) => {
      if (token.type === 'android' || token.type === 'ios') tellServer(device, token.type, token.data).catch(() => {});
    });
    return () => {
      taps.remove();
      arrivals.remove();
      tokens.remove();
    };
  }, [device]);
}
