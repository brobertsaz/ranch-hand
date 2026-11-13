// The parts of the build that depend on where it's going. app.json holds everything that doesn't.
const fs = require('fs');
const path = require('path');
const { withEntitlementsPlist } = require('expo/config-plugins');

// A build pointed at a laptop (EXPO_PUBLIC_API_URL=http://192.168.x.x:3000 in .env.local) has to be allowed
// plain HTTP. Every other build, the store's included, talks HTTPS only.
const localServer = (process.env.EXPO_PUBLIC_API_URL ?? '').startsWith('http://');

// Sign in with Apple and push notifications are entitlements only a paid Apple developer account can sign.
// On a free Apple ID the build fails with them in, so they stay out until EXPO_PUBLIC_APPLE_ENTITLEMENTS=1
// is set (.env.local, or the build's environment). The app reads the same flag to offer the features.
const appleEntitlements = process.env.EXPO_PUBLIC_APPLE_ENTITLEMENTS === '1';

// Android notifications need the Firebase project's google-services.json beside this file. Without it the
// app builds and runs; it just can't get a push token.
const googleServices = path.join(__dirname, 'google-services.json');

// Expo puts both entitlements in whenever expo-notifications and expo-apple-authentication are installed,
// listed as plugins or not. This takes them back out.
const withoutAppleEntitlements = (config) =>
  withEntitlementsPlist(config, (entitlements) => {
    delete entitlements.modResults['aps-environment'];
    delete entitlements.modResults['com.apple.developer.applesignin'];
    return entitlements;
  });

module.exports = ({ config }) => {
  const plugins = config.plugins.map((plugin) => {
    if (!Array.isArray(plugin) || plugin[0] !== 'expo-build-properties' || !localServer) return plugin;
    return [plugin[0], { ...plugin[1], android: { ...plugin[1].android, usesCleartextTraffic: true } }];
  });
  // First in the list: the edits a plugin makes to a native file run in reverse order, so the first plugin's
  // edit is the last word
  if (!appleEntitlements) plugins.unshift(withoutAppleEntitlements);

  return {
    ...config,
    ios: {
      ...config.ios,
      ...(appleEntitlements ? { usesAppleSignIn: true } : {}),
      ...(localServer
        ? {
            infoPlist: {
              ...config.ios.infoPlist,
              NSLocalNetworkUsageDescription: 'Ranch Hand syncs with the test server on your local network.',
              NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
            },
          }
        : {}),
    },
    android: {
      ...config.android,
      ...(fs.existsSync(googleServices) ? { googleServicesFile: './google-services.json' } : {}),
    },
    plugins,
  };
};
