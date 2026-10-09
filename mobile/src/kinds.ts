import type { IconName } from './components/Icon';
import type { Kind, Waypoint, WaypointKind } from './db';
import { distanceMeters, type LngLat } from './format';
import { kindColors, palette, waypointColors } from './theme';

// Display copy and icons for each observation kind
type KindInfo = {
  label: string; // form tile and detail
  short: string; // filter chip
  badge: string; // peek card and detail header
  icon: IconName;
  pinColor: string;
  badgeColor: string; // behind small text, so darker than the pin where needed
  onColor: string; // icon and text drawn on the pin or badge
  tint: string; // icon on a light card
  // Does the thing move? A sick animal wanders off; feed, water and gates stay put. null: can't say.
  moves: boolean | null;
};

export const KIND_INFO: Record<Kind, KindInfo> = {
  sick_animal: {
    label: 'Sick animal', short: 'Sick', badge: 'SICK ANIMAL', icon: 'plus',
    pinColor: kindColors.sick_animal, badgeColor: palette.trailDark, onColor: palette.white, tint: palette.trailDark, moves: true,
  },
  feed_check: {
    label: 'Feed', short: 'Feed', badge: 'FEED', icon: 'feed',
    pinColor: kindColors.feed_check, badgeColor: kindColors.feed_check, onColor: palette.ink, tint: '#B8801F', moves: false,
  },
  water_check: {
    label: 'Water', short: 'Water', badge: 'WATER', icon: 'water',
    pinColor: kindColors.water_check, badgeColor: '#2E7488', onColor: palette.white, tint: '#2E7488', moves: false,
  },
  fence_issue: {
    label: 'Fence', short: 'Fence', badge: 'FENCE', icon: 'fence',
    pinColor: kindColors.fence_issue, badgeColor: kindColors.fence_issue, onColor: palette.white, tint: palette.leather, moves: false,
  },
  gate_issue: {
    label: 'Gate', short: 'Gate', badge: 'GATE', icon: 'gate',
    pinColor: kindColors.gate_issue, badgeColor: kindColors.gate_issue, onColor: palette.white, tint: palette.sky, moves: false,
  },
  other: {
    label: 'Other', short: 'Other', badge: 'OTHER', icon: 'pin',
    pinColor: kindColors.other, badgeColor: kindColors.other, onColor: palette.white, tint: palette.muted, moves: null,
  },
};

// Tap-to-pick details, so a hand in gloves rarely has to type. Picks are saved into the
// observation's note ("Limping, Bad hoof — by the creek"), so sync and the API don't change.
export const CONDITIONS: Record<Kind, { prompt: string; options: string[] }> = {
  sick_animal: {
    prompt: "What's wrong?",
    options: ['Limping', 'Bad hoof', 'Bleeding', 'Off feed', 'Down', 'Coughing', 'Scours', 'Pinkeye', 'Bloated', 'Calving trouble'],
  },
  feed_check: { prompt: "How's the feed?", options: ['Full', 'Low', 'Empty', 'Wet or moldy', 'Feeder broken'] },
  water_check: { prompt: "How's the water?", options: ['Full', 'Low', 'Empty', 'Dirty', 'Frozen', 'Float stuck', 'Leaking'] },
  fence_issue: {
    prompt: "What's wrong with it?",
    options: ['Wire down', 'Post broken', 'Needs mending', 'Section missing', 'Cattle got out'],
  },
  gate_issue: { prompt: "How's the gate?", options: ['Closed', 'Left open', 'Broken', 'Latch broken', "Won't close"] },
  other: { prompt: 'What is it?', options: ['Predator sign', 'Tree down', 'Road washed out', 'Dead animal'] },
};

export function composeNote(picks: string[], extra: string): string | null {
  const text = [picks.join(', '), extra.trim()].filter(Boolean).join(' — ');
  return text || null;
}

// Kinds that are checks on a place that stays put. Logging one offers to save or reuse the place.
export const PLACE_KIND: Partial<Record<Kind, WaypointKind>> = {
  feed_check: 'feed',
  water_check: 'water',
  gate_issue: 'gate',
};

// Within this, a new check belongs to the existing place rather than a new one
export const SAME_PLACE_METERS = 75;

type WaypointInfo = { label: string; icon: IconName; color: string; onColor: string; badgeColor: string; kind: Kind };

export const WAYPOINT_INFO: Record<WaypointKind, WaypointInfo> = {
  feed: { label: 'Feed', icon: 'feed', color: waypointColors.feed, onColor: palette.ink, badgeColor: waypointColors.feed, kind: 'feed_check' },
  water: { label: 'Water', icon: 'water', color: waypointColors.water, onColor: palette.white, badgeColor: '#2E7488', kind: 'water_check' },
  gate: { label: 'Gate', icon: 'gate', color: waypointColors.gate, onColor: palette.white, badgeColor: waypointColors.gate, kind: 'gate_issue' },
  fence: { label: 'Fence', icon: 'fence', color: waypointColors.fence, onColor: palette.white, badgeColor: waypointColors.fence, kind: 'fence_issue' },
  other: { label: 'Place', icon: 'pin', color: waypointColors.other, onColor: palette.white, badgeColor: waypointColors.other, kind: 'other' },
};

// "Water 3": the next free number for that kind, so nobody has to type a name in the field
export function nextPlaceName(waypoints: Waypoint[], kind: WaypointKind): string {
  const label = WAYPOINT_INFO[kind].label;
  const numbers = waypoints
    .filter((w) => w.kind === kind)
    .map((w) => Number(new RegExp(`^${label} (\\d+)$`).exec(w.name)?.[1] ?? 0));
  return `${label} ${Math.max(0, ...numbers) + 1}`;
}

export function nearestPlace(waypoints: Waypoint[], kind: WaypointKind, here: LngLat): { waypoint: Waypoint; meters: number } | null {
  let best: { waypoint: Waypoint; meters: number } | null = null;
  for (const waypoint of waypoints) {
    if (waypoint.kind !== kind) continue;
    const meters = distanceMeters(here, [waypoint.longitude, waypoint.latitude]);
    if (meters <= SAME_PLACE_METERS && (!best || meters < best.meters)) best = { waypoint, meters };
  }
  return best;
}
