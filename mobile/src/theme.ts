// Ranch Hand color scheme, taken from the Ranch Atlas brand (ranch-atlas/app/globals.css).
// Pine for the dark chrome, Canvas for reading surfaces, Trail for the one main action.

import { Appearance } from 'react-native';

import type { Kind } from './db';
import { readThemeMode, type ThemeMode } from './themeMode';

export const palette = {
  pine: '#101713',
  pineSoft: '#1A241E',
  canvas: '#F5EFE0',
  canvasDeep: '#E9DFCA',
  card: '#FFFDF7',
  ink: '#171B18',
  muted: '#697068', // 4.4:1 on canvas, 5.0:1 on card: use on card, or for 18pt+ text on canvas
  trail: '#CF4A2E', // white text is 4.49:1: big bold labels only
  trailDark: '#B83F26', // white text is 5.6:1: use behind normal-size button text
  sky: '#244C57',
  leather: '#9C5A2D',
  focus: '#FFB18F',
  destructive: '#A72920',
  white: '#FFFFFF',
  // Field additions for map pins: they sit on aerial imagery, so each is a different lightness
  harvest: '#E3A33B',
  creek: '#3D8EA3',
} as const;

const lightColors = {
  background: palette.canvas,
  surface: palette.card,
  surfaceSunken: palette.canvasDeep,
  text: palette.ink,
  textMuted: palette.muted,
  border: 'rgba(23, 27, 24, 0.18)',
  // The faint line under a card, and between rows
  hairline: 'rgba(23, 27, 24, 0.1)',
  input: 'rgba(23, 27, 24, 0.22)',
  inputBackground: palette.white,
  placeholder: 'rgba(23, 27, 24, 0.3)',
  primary: palette.trailDark,
  primaryText: palette.white,
  secondary: palette.sky,
  secondaryText: palette.white,
  accent: palette.leather,
  danger: palette.destructive,
  dangerBackground: '#F8E1DC',
  focus: palette.focus,
  // "Waiting for signal" boxes
  warn: '#C98A22',
  warnBackground: '#FBEFD6',
  warnText: '#5E4A26',
  // Stamp outlines and words: darker than the pin colors so they hold 4.5:1 on canvas and card
  stampOpen: palette.trailDark,
  stampDone: '#3B6E4A',
  stampClear: palette.sky,
  // Dark chrome over the map and camera
  chrome: palette.pine,
  chromeRaised: palette.pineSoft,
  chromeText: palette.canvas,
  chromeTextMuted: 'rgba(245, 239, 224, 0.72)',
  scrim: 'rgba(10, 16, 12, 0.6)',
  statusBar: 'dark' as 'dark' | 'light',
};

// Night Ride: pine all the way down, canvas text, and the trail red brightened so open problems glow
type ColorSet = { [K in Exclude<keyof typeof lightColors, 'statusBar'>]: string } & { statusBar: 'dark' | 'light' };

const darkColors: ColorSet = {
  background: '#0B110D',
  surface: '#151E18',
  surfaceSunken: '#0F1712',
  text: palette.canvas,
  textMuted: '#A9B0A6',
  border: 'rgba(245, 239, 224, 0.16)',
  hairline: 'rgba(245, 239, 224, 0.08)',
  input: 'rgba(245, 239, 224, 0.28)',
  inputBackground: '#1D2822',
  placeholder: 'rgba(245, 239, 224, 0.4)',
  primary: palette.trailDark,
  primaryText: palette.white,
  secondary: '#2E6573',
  secondaryText: palette.white,
  accent: '#C4824F',
  danger: '#FF7A5C',
  dangerBackground: '#3A1B14',
  focus: palette.focus,
  warn: palette.harvest,
  warnBackground: '#2A2414',
  warnText: '#E9D3A6',
  stampOpen: '#FF7A5C',
  stampDone: '#6FCF7F',
  stampClear: '#7FB3C0',
  chrome: '#080D0A',
  chromeRaised: palette.pineSoft,
  chromeText: palette.canvas,
  chromeTextMuted: 'rgba(245, 239, 224, 0.72)',
  scrim: 'rgba(0, 0, 0, 0.7)',
  statusBar: 'light',
};

// Light, Dark, or follow the phone. Read once at launch: every StyleSheet is built from these colors when its
// file loads, so switching restarts the app (see setThemeMode).
export const themeMode: ThemeMode = readThemeMode();
export const isDark = themeMode === 'dark' || (themeMode === 'auto' && Appearance.getColorScheme() === 'dark');
export const colors: ColorSet = isDark ? darkColors : lightColors;

// Pin colors by observation kind. Pins always get a white ring and an icon, so color is never the only cue.
export const kindColors: Record<Kind, string> = {
  sick_animal: palette.trail,
  feed_check: palette.harvest,
  water_check: palette.creek,
  fence_issue: palette.leather,
  gate_issue: palette.sky,
  other: palette.muted,
};

export const waypointColors = {
  feed: palette.harvest,
  water: palette.creek,
  gate: palette.sky,
  fence: palette.leather,
  other: palette.muted,
} as const;

export const sync = {
  pending: palette.harvest, // saved on the phone, waiting for signal
  synced: '#4E8A5B',
  failed: palette.destructive,
} as const;

export const radius = { sm: 4, md: 8, lg: 14, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// Gloves and sunlight: big targets, heavy type. Nothing tappable under `min`; the main action on a screen is `primary`.
export const touch = { min: 56, primary: 64, shutter: 88, round: 52 } as const;

export const fonts = {
  // Condensed display face, like the Ranch Atlas headings. Load with @expo-google-fonts/barlow-condensed
  display: 'BarlowCondensed_800ExtraBold',
  displayBlack: 'BarlowCondensed_900Black',
  body: undefined, // system font (SF Pro / Roboto)
} as const;

export const theme = { palette, colors, kindColors, waypointColors, sync, radius, space, touch, fonts };
export default theme;
