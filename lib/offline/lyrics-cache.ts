import type { LyricsPayload } from '@/lib/types';

/**
 * Lyrics survive restarts and work with no connection. Every lyric that was ever
 * shown (or fetched while downloading a track) is kept on the device.
 */

const KEY = 'dvibes-lyrics-v1';
const MAX_ENTRIES = 250;

interface Entry {
  payload: LyricsPayload;
  savedAt: number;
}

let memory: Record<string, Entry> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function load(): Record<string, Entry> {
  if (memory) return memory;
  memory = {};
  if (typeof localStorage === 'undefined') return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw) as Record<string, Entry>;
  } catch {
    memory = {};
  }
  return memory;
}

function schedulePersist(): void {
  if (typeof localStorage === 'undefined') return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(load()));
    } catch {
      // Storage full: drop the oldest half and try once more.
      const all = load();
      const ids = Object.keys(all).sort((a, b) => all[a].savedAt - all[b].savedAt);
      ids.slice(0, Math.ceil(ids.length / 2)).forEach((id) => delete all[id]);
      try {
        localStorage.setItem(KEY, JSON.stringify(all));
      } catch {
        // give up silently; lyrics will simply be re-fetched online
      }
    }
  }, 400);
}

export function getStoredLyrics(videoId: string): LyricsPayload | null {
  return load()[videoId]?.payload ?? null;
}

export function storeLyrics(payload: LyricsPayload): void {
  const all = load();
  all[payload.videoId] = { payload, savedAt: Date.now() };

  const ids = Object.keys(all);
  if (ids.length > MAX_ENTRIES) {
    ids
      .sort((a, b) => all[a].savedAt - all[b].savedAt)
      .slice(0, ids.length - MAX_ENTRIES)
      .forEach((id) => delete all[id]);
  }
  schedulePersist();
}

export function hasStoredLyrics(videoId: string): boolean {
  return !!load()[videoId];
}

export function clearStoredLyrics(): void {
  memory = {};
  if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
}
