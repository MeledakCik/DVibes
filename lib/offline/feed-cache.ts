import type { SearchPayload } from '@/lib/types';

/** Last home feed + last searches, so the app opens with content even offline. */

const KEY = 'dvibes-feed-v1';
const MAX_SEARCHES = 20;

interface FeedStore {
  home: SearchPayload | null;
  searches: Record<string, SearchPayload>;
  order: string[];
}

let memory: FeedStore | null = null;

function load(): FeedStore {
  if (memory) return memory;
  memory = { home: null, searches: {}, order: [] };
  if (typeof localStorage === 'undefined') return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw) as FeedStore;
  } catch {
    memory = { home: null, searches: {}, order: [] };
  }
  return memory;
}

function persist(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch {
    // ignore quota errors
  }
}

export function saveHomeFeed(payload: SearchPayload): void {
  load().home = payload;
  persist();
}

export function loadHomeFeed(): SearchPayload | null {
  return load().home;
}

export function saveSearchResult(payload: SearchPayload): void {
  const store = load();
  const key = payload.query.trim().toLowerCase();
  store.searches[key] = payload;
  store.order = [key, ...store.order.filter((item) => item !== key)];
  store.order.slice(MAX_SEARCHES).forEach((old) => delete store.searches[old]);
  store.order = store.order.slice(0, MAX_SEARCHES);
  persist();
}

export function loadSearchResult(query: string): SearchPayload | null {
  return load().searches[query.trim().toLowerCase()] ?? null;
}
