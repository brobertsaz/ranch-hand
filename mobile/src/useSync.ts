import * as Network from 'expo-network';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';

import { pendingCounts } from './db';
import type { Device } from './settings';
import { sync } from './sync';

export type SyncState = {
  online: boolean;
  syncing: boolean;
  lastResult: string | null;
  pending: { records: number; uploads: number };
};

export function useSync(device: Device) {
  const [state, setState] = useState<SyncState>({ online: false, syncing: false, lastResult: null, pending: { records: 0, uploads: 0 } });
  const wasOnline = useRef(false);

  const refreshPending = useCallback(async () => {
    const pending = await pendingCounts();
    setState((s) => ({ ...s, pending }));
  }, []);

  const syncNow = useCallback(async () => {
    setState((s) => ({ ...s, syncing: true }));
    try {
      const r = await sync(device);
      const at = new Date().toLocaleTimeString();
      setState((s) => ({ ...s, lastResult: `${at}: pulled ${r.pulled}, pushed ${r.pushed}, photos ↑${r.uploaded} ↓${r.downloaded}` }));
    } catch (error) {
      setState((s) => ({ ...s, lastResult: `Sync failed: ${(error as Error).message}` }));
    } finally {
      setState((s) => ({ ...s, syncing: false }));
      refreshPending();
    }
  }, [device, refreshPending]);

  useEffect(() => {
    refreshPending();
    const dbSub = addDatabaseChangeListener(() => refreshPending());

    // Sync on launch and whenever signal comes back
    const onNetwork = ({ isInternetReachable, isConnected }: Network.NetworkState) => {
      const online = Boolean(isInternetReachable ?? isConnected);
      if (online && !wasOnline.current) syncNow();
      wasOnline.current = online;
      setState((s) => ({ ...s, online }));
    };
    Network.getNetworkStateAsync().then(onNetwork);
    const netSub = Network.addNetworkStateListener(onNetwork);

    return () => {
      dbSub.remove();
      netSub.remove();
    };
  }, [refreshPending, syncNow]);

  return { ...state, syncNow };
}
