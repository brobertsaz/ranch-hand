import * as Network from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { errorText, isSignedOut } from './api';
import { onDatabaseChange, pendingCounts, syncProblems, type SyncProblem } from './db';
import type { Device } from './settings';
import { sync, SyncCancelled } from './sync';

// removed: the owner took this phone off the crew. unknown: the server just doesn't know its token any more.
export type SignedOut = 'removed' | 'unknown';

export type SyncState = {
  online: boolean;
  syncing: boolean;
  lastResult: string | null;
  // Why the last run failed, in plain words; null once a run works
  error: string | null;
  // The server no longer accepts this phone. Syncing stops until it joins again.
  signedOut: SignedOut | null;
  pending: { records: number; uploads: number };
  // Records and photos the server turned down. They stay on this phone.
  problems: SyncProblem[];
};

// While the app is open and has signal, pick up the crew's changes this often without anyone tapping Sync
const PERIODIC_SYNC_MS = 3 * 60_000;

const SYNCED_TABLES = ['waypoints', 'observations', 'photos', 'rides'];

export function signedOutText(signedOut: SignedOut, ranchName: string): string {
  return signedOut === 'removed' ? `This phone was removed from ${ranchName}.` : 'This phone is no longer signed in.';
}

export function useSync(device: Device) {
  const [state, setState] = useState<SyncState>({
    online: false, syncing: false, lastResult: null, error: null, signedOut: null, pending: { records: 0, uploads: 0 }, problems: [],
  });
  const wasOnline = useRef(false);
  // Runs this hook is waiting on: a follow-up can still be going when the first one returns
  const inFlight = useRef(0);
  const signedOut = useRef(false);

  const refreshPending = useCallback(async () => {
    const [pending, problems] = await Promise.all([pendingCounts(), syncProblems()]);
    setState((s) => ({ ...s, pending, problems }));
  }, []);

  const syncNow = useCallback(async () => {
    inFlight.current++;
    setState((s) => ({ ...s, syncing: true }));
    try {
      const r = await sync(device);
      const at = new Date().toLocaleTimeString();
      const turnedDown = r.rejected > 0 ? `, ${r.rejected} turned down` : '';
      signedOut.current = false;
      setState((s) => ({
        ...s,
        lastResult: `${at}: pulled ${r.pulled}, pushed ${r.pushed}${turnedDown}, photos ↑${r.uploaded} ↓${r.downloaded}`,
        error: r.photoProblem,
        signedOut: null,
      }));
    } catch (error) {
      // Stopped on purpose (leaving the ranch); nothing to report
      if (error instanceof SyncCancelled) return;
      if (isSignedOut(error)) {
        signedOut.current = true;
        setState((s) => ({ ...s, error: null, signedOut: error.code === 'removed' ? 'removed' : 'unknown' }));
        return;
      }
      setState((s) => ({ ...s, error: errorText(error), lastResult: `Sync failed: ${errorText(error)}` }));
    } finally {
      inFlight.current--;
      const syncing = inFlight.current > 0;
      setState((s) => ({ ...s, syncing }));
      refreshPending();
    }
  }, [device, refreshPending]);

  useEffect(() => {
    refreshPending();
    const dbSub = onDatabaseChange(SYNCED_TABLES, refreshPending);

    // The app's own triggers. A signed-out phone gets the same 401 every time, so only a tap on Sync asks again.
    const auto = () => {
      if (!signedOut.current) syncNow();
    };

    // Sync on launch and whenever signal comes back
    const onNetwork = ({ isInternetReachable, isConnected }: Network.NetworkState) => {
      const online = Boolean(isInternetReachable ?? isConnected);
      if (online && !wasOnline.current) auto();
      wasOnline.current = online;
      setState((s) => ({ ...s, online }));
    };
    Network.getNetworkStateAsync().then(onNetwork);
    const netSub = Network.addNetworkStateListener(onNetwork);

    // Back from the pocket or another app: the crew may have logged things since
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && wasOnline.current) auto();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && wasOnline.current) auto();
    }, PERIODIC_SYNC_MS);

    return () => {
      dbSub.remove();
      netSub.remove();
      appSub.remove();
      clearInterval(timer);
    };
  }, [refreshPending, syncNow]);

  return { ...state, syncNow };
}
