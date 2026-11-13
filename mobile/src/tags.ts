import { observationsOfTag, type Observation } from './db';
import { timeAgo } from './format';

// "Seen 3 times, last 2 days ago", or null when this tag has never been logged. `except` is the pin being
// looked at or edited, which isn't news about itself.
export async function tagHint(tag: string, except: string | null = null): Promise<string | null> {
  if (!tag.trim()) return null;
  const sightings = (await observationsOfTag(tag)).filter((o) => o.id !== except);
  return describeSightings(sightings);
}

export function describeSightings(sightings: Observation[], now = Date.now()): string | null {
  if (sightings.length === 0) return null;
  const times = sightings.length === 1 ? 'once' : `${sightings.length} times`;
  return `Logged ${times} before, last ${timeAgo(sightings[0].observed_at, now)}`;
}
