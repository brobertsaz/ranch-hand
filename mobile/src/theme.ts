// Ranch Hand color scheme, taken from the Ranch Atlas brand (ranch-atlas/app/globals.css).
// Pine for the dark chrome, Canvas for reading surfaces, Trail for the one main action.

import type { Kind } from './db';

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

export const colors = {
  background: palette.canvas,
  surface: palette.card,
  surfaceSunken: palette.canvasDeep,
  text: palette.ink,
  textMuted: palette.muted,
  border: 'rgba(23, 27, 24, 0.18)',
  input: 'rgba(23, 27, 24, 0.22)',
  primary: palette.trailDark,
  primaryText: palette.white,
  secondary: palette.sky,
  secondaryText: palette.white,
  accent: palette.leather,
  danger: palette.destructive,
  focus: palette.focus,
  // Dark chrome over the map and camera
  chrome: palette.pine,
  chromeRaised: palette.pineSoft,
  chromeText: palette.canvas,
  chromeTextMuted: 'rgba(245, 239, 224, 0.72)',
  scrim: 'rgba(10, 16, 12, 0.6)',
} as const;

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
