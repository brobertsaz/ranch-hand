import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

import { appleSignInAvailable } from './apple';

// The web client ID, not the Android one: Google addresses the ID token to it, and the API checks for it.
// The Android client only has to exist in the same Google Cloud project (ranch-hand-512121), tied to the
// build's SHA-1. Client IDs ship inside every app, so this isn't a secret.
const WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '945158508198-ve3lt3d2fkisfsqbdh2j9v3p0jikkooi.apps.googleusercontent.com';

// Owners start a ranch with Google on Android, and with Apple on an iPhone build that carries the entitlement.
// shortcut: no Google button on iPhone, since it needs its own iOS client ID and URL scheme, upgrade when an
// owner with a Google-made ranch moves to an iPhone
export const canStartRanch = Platform.OS === 'android' || appleSignInAvailable;

// shortcut: the free google-signin package uses Google's deprecated legacy Sign-In SDK on Android, upgrade to
// Credential Manager (react-native-nitro-google-signin) before Google drops the legacy SDK
// Null when they back out of Google's account picker
export async function googleIdToken(): Promise<string | null> {
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  // Clears the last pick so the account chooser always shows: plenty of owners have a ranch account and a personal one
  await GoogleSignin.signOut();
  const response = await GoogleSignin.signIn();
  return isSuccessResponse(response) ? response.data.idToken : null;
}
