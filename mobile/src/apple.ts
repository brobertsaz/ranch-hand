import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

// Owners on iPhone start a ranch with Sign in with Apple. The build only carries its entitlement once the
// Apple developer account is paid for, so until then (see app.config.js) iPhones can join a ranch but not start one.
export const appleSignInAvailable = Platform.OS === 'ios' && process.env.EXPO_PUBLIC_APPLE_ENTITLEMENTS === '1';

export type AppleSignIn = { identityToken: string; name: string | null };

// Null when they back out of Apple's sheet. Apple gives the name only the first time someone signs in to the
// app, and never puts it in the token, so it goes to the server alongside.
export async function appleSignIn(): Promise<AppleSignIn | null> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!credential.identityToken) throw new Error('Apple sent no identity token.');
    const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
    return { identityToken: credential.identityToken, name: name || null };
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw error;
  }
}
