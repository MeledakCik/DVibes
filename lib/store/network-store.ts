'use client';

import { create } from 'zustand';
import { useSettingsStore } from './settings-store';

interface NetworkState {
  browserOnline: boolean;
  setBrowserOnline: (value: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  browserOnline: true,
  setBrowserOnline: (browserOnline) => set({ browserOnline })
}));

let started = false;

/** Call once on the client. Mirrors navigator.onLine into the store. */
export function startNetworkWatcher(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const sync = () => useNetworkStore.getState().setBrowserOnline(navigator.onLine);
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}

/** True when the device has no connection OR the user switched offline mode on. */
export function isOffline(): boolean {
  return useSettingsStore.getState().forceOffline || !useNetworkStore.getState().browserOnline;
}

export function useIsOffline(): boolean {
  const forced = useSettingsStore((state) => state.forceOffline);
  const online = useNetworkStore((state) => state.browserOnline);
  return forced || !online;
}

export function useNetworkInfo(): { offline: boolean; forced: boolean; deviceOnline: boolean } {
  const forced = useSettingsStore((state) => state.forceOffline);
  const deviceOnline = useNetworkStore((state) => state.browserOnline);
  return { offline: forced || !deviceOnline, forced, deviceOnline };
}
