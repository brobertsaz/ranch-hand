import type { IconName } from './components/Icon';
import type { Kind } from './db';
import { kindColors, palette } from './theme';

// Display copy and icons for the four observation kinds the sync API accepts.
// The canvas also shows Water and Gate; those need new kinds on the server first.
type KindInfo = {
  label: string; // form tile and detail
  short: string; // filter chip
  badge: string; // peek card and detail header
  icon: IconName;
  pinColor: string;
  badgeColor: string; // behind small text, so Trail dark rather than Trail
  onColor: string; // icon and text drawn on the pin or badge
  tint: string; // icon on a light card
  // Does the thing move? A sick animal wanders off; feed and fences stay put. null: can't say.
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
  fence_issue: {
    label: 'Fence', short: 'Fence', badge: 'FENCE', icon: 'fence',
    pinColor: kindColors.fence_issue, badgeColor: kindColors.fence_issue, onColor: palette.white, tint: palette.leather, moves: false,
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
  fence_issue: {
    prompt: "What's wrong with it?",
    options: ['Wire down', 'Post broken', 'Needs mending', 'Section missing', 'Gate open', 'Cattle got out'],
  },
  // Water sits here until it's a kind of its own on the server
  other: { prompt: 'What is it?', options: ['Water low', 'Tank empty', 'Tank leaking', 'Predator sign', 'Tree down', 'Road washed out'] },
};

export function composeNote(picks: string[], extra: string): string | null {
  const text = [picks.join(', '), extra.trim()].filter(Boolean).join(' — ');
  return text || null;
}
