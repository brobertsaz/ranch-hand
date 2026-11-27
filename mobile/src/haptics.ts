// A buzz in the hand, so a gloved rider knows a tap took without looking. Haptics is a native module: a dev
// build made before it was added doesn't have it, so this does nothing there instead of crashing the screen.
type HapticsModule = typeof import('expo-haptics');

let haptics: HapticsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded lazily so a missing native module is survivable
  haptics = require('expo-haptics') as HapticsModule;
} catch {
  haptics = null;
}

// Something was saved: a pin dropped, a problem resolved
export function buzzSuccess() {
  haptics?.notificationAsync(haptics.NotificationFeedbackType.Success).catch(() => {});
}

// A press that changes something on screen: the shutter, a kind tile
export function buzzTap() {
  haptics?.impactAsync(haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
