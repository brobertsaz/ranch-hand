import { db, getState, setState, type Observation, type ObservationStatus, type Ride, type Waypoint } from './db';
import { formatDistance, formatDuration } from './format';
import { KIND_INFO, STATUS_LABEL } from './kinds';
import { palette } from './theme';

// "What's new": what the rest of the crew did, newest first. Your own work isn't news to you.
export type NewsItem = {
  key: string;
  at: number; // when it happened, on the phone that did it
  arrivedAt: number | null; // when it reached this phone; null for history pulled on first sync
  memberId: string | null;
  title: string;
  detail: string;
  color: string;
  icon: (typeof KIND_INFO)[keyof typeof KIND_INFO]['icon'] | 'rides';
  observationId?: string;
  // Where a logged problem stands now, so a row you already handled says so
  status?: ObservationStatus;
  rideId?: string;
};

type Row<T> = T & { pulled_at: number | null };

const SEEN_KEY = 'news_seen_at';

export async function newsSeenAt(): Promise<number> {
  return Number((await getState(SEEN_KEY)) ?? 0);
}

export async function markNewsSeen(): Promise<void> {
  await setState(SEEN_KEY, String(Date.now()));
}

export async function crewNews(myId: string, limit = 100): Promise<NewsItem[]> {
  const conn = db();
  const [observations, rides, waypoints] = await Promise.all([
    conn.getAllAsync<Row<Observation>>(`SELECT * FROM observations WHERE _status != 'deleted'`),
    conn.getAllAsync<Row<Ride>>(`SELECT * FROM rides WHERE _status != 'deleted' AND member_id IS NOT ?`, myId),
    conn.getAllAsync<Waypoint>(`SELECT * FROM waypoints`),
  ]);
  const placeName = Object.fromEntries(waypoints.map((w) => [w.id, w.name]));
  const items: NewsItem[] = [];

  for (const o of observations) {
    const info = KIND_INFO[o.kind];
    const place = o.waypoint_id ? placeName[o.waypoint_id] : undefined;
    // "Tag 1147 · sick", "Water 1 · Low", or the note
    const what = o.note ?? (o.status === 'ok' ? 'all clear' : info.label);
    const subject = o.tag_number ? `Tag ${o.tag_number} · ${info.short.toLowerCase()}` : place ? `${place} · ${what}` : what;
    // The note when the title didn't have room for it; the place is already in the title
    const detail = o.tag_number && o.note ? o.note : '';
    const base = { color: info.pinColor, icon: info.icon, observationId: o.id, arrivedAt: o.pulled_at };

    if (o.member_id !== myId) {
      items.push({ ...base, key: `${o.id}:logged`, at: o.observed_at, memberId: o.member_id, title: subject, detail, status: o.status });
    }
    if (o.status === 'resolved' && o.resolved_by_id && o.resolved_by_id !== myId && o.resolved_at) {
      items.push({ ...base, key: `${o.id}:resolved`, at: o.resolved_at, memberId: o.resolved_by_id, title: `${subject} · ${STATUS_LABEL.resolved.toLowerCase()}`, detail });
    }
  }
  for (const r of rides) {
    items.push({
      key: `${r.id}:ride`, at: r.ended_at, arrivedAt: r.pulled_at, memberId: r.member_id, rideId: r.id, icon: 'rides', color: palette.sky,
      title: r.name ?? `Rode ${formatDistance(r.distance_meters)}`,
      detail: r.name ? `${formatDistance(r.distance_meters)} · ${formatDuration(r.ended_at - r.started_at)}` : formatDuration(r.ended_at - r.started_at),
    });
  }

  return items.sort((a, b) => b.at - a.at).slice(0, limit);
}

export function isNew(item: NewsItem, seenAt: number): boolean {
  return item.arrivedAt !== null && item.arrivedAt > seenAt;
}

// "TODAY", "YESTERDAY", then "TUE, OCT 6"
export function dayLabel(at: number, now = Date.now()): string {
  const day = (t: number) => new Date(t).toDateString();
  if (day(at) === day(now)) return 'TODAY';
  if (day(at) === day(now - 86_400_000)) return 'YESTERDAY';
  return new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}
