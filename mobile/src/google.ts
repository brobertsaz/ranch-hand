import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

// The web client ID, not the Android one: Google addresses the ID token to it, and the API checks for it.
// The Android client only has to exist in the same Google Cloud project, tied to the build's SHA-1.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// Owners start a ranch on Android only for now; iOS needs its own client and Sign in with Apple
export const canStartRanch = Platform.OS === 'android';

// Builds without the ID (most dev builds) can still join a ranch, just not start one
export const googleConfigured = !!WEB_CLIENT_ID;

// Null when they back out of Google's account picker
export async function googleIdToken(): Promise<string | null> {
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  // Clears the last pick so the account chooser always shows: plenty of owners have a ranch account and a personal one
  await GoogleSignin.signOut();
  const response = await GoogleSignin.signIn();
  return isSuccessResponse(response) ? response.data.idToken : null;
}
