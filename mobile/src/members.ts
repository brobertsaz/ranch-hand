import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { memberNames, memberRole } from './db';

// The crew's names by member id, kept current as syncs bring new members in
export function useMemberNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = () => memberNames().then(setNames);
    load();
    const sub = addDatabaseChangeListener(({ tableName }) => tableName === 'members' && load());
    return () => sub.remove();
  }, []);

  return names;
}

// Owners can delete places. Hands can't, so the crew's gate list can't vanish by accident (the server agrees).
export function useIsOwner(memberId: string): boolean {
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    const load = () => memberRole(memberId).then((role) => setOwner(role === 'owner'));
    load();
    const sub = addDatabaseChangeListener(({ tableName }) => tableName === 'members' && load());
    return () => sub.remove();
  }, [memberId]);

  return owner;
}

// "You", the hand's name, or a fallback until the first sync brings names down
export function who(names: Record<string, string>, memberId: string | null, myId: string): string {
  if (memberId === myId) return 'You';
  return (memberId && names[memberId]) || 'Another hand';
}

// "Jess Rowe" -> "JR"; "Sam (test)" -> "S", ignoring asides and punctuation
export function initials(name: string): string {
  const parts = name
    .replace(/\(.*?\)/g, ' ')
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() || '?';
}
