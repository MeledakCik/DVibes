import type { LyricsPayload, SearchPayload, StreamPayload, Track } from '@/lib/types';
import { discoverCatalog, searchCatalog } from '@/lib/api/catalog';
import { getLyrics, LyricsNotFoundError } from '@/lib/api/lyrics';
import {
  invalidateCachedStream,
  resolveStream,
  StreamResolutionError,
  type ResolveOptions
} from '@/lib/api/resolver';
import { loadHomeFeed, loadSearchResult, saveHomeFeed, saveSearchResult } from '@/lib/offline/feed-cache';
import { getStoredLyrics, storeLyrics } from '@/lib/offline/lyrics-cache';
import { isOffline } from '@/lib/store/network-store';
import { useDownloadsStore, useOfflineStore } from '@/lib/store/downloads-store';
import { useLibraryStore } from '@/lib/store/library-store';

interface CachedStream {
  value: StreamPayload;
  expiresAt: number;
}

const clientStreamCache = new Map<string, CachedStream>();

export class ApiClientError extends Error {
  code: string;
  attempts?: string[];

  constructor(message: string, code = 'REQUEST_FAILED', attempts?: string[]) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.attempts = attempts;
  }
}

function attemptsOf(error: unknown): string[] | undefined {
  if (error && typeof error === 'object' && 'attempts' in error) {
    const attempts = (error as { attempts?: unknown }).attempts;
    if (Array.isArray(attempts)) return attempts.map(String);
  }
  return undefined;
}

export function getCachedStream(videoId: string): StreamPayload | null {
  const cached = clientStreamCache.get(videoId);
  if (!cached) return null;
  if (Date.now() >= cached.expiresAt) {
    clientStreamCache.delete(videoId);
    return null;
  }
  return cached.value;
}

export function evictCachedStream(videoId: string): void {
  clientStreamCache.delete(videoId);
  invalidateCachedStream(videoId);
}

export function primeStreamCache(stream: StreamPayload): void {
  clientStreamCache.set(stream.videoId, {
    value: { ...stream, cached: true },
    expiresAt: Math.min(stream.expiresAt, Date.now() + 60 * 60 * 1000)
  });
}

export async function resolveStreamClient(
  videoId: string,
  options: ResolveOptions = {}
): Promise<StreamPayload> {
  if (options.force) {
    evictCachedStream(videoId);
  } else {
    const cached = getCachedStream(videoId);
    if (cached) return cached;
  }

  if (isOffline()) {
    throw new ApiClientError(
      'You are offline. Download this track or import a local audio file to play without internet.',
      'OFFLINE'
    );
  }

  try {
    const { stream, cached } = await resolveStream(videoId, options);
    const data: StreamPayload = { ...stream, cached };
    primeStreamCache(data);
    return data;
  } catch (error) {
    if (error instanceof StreamResolutionError) {
      throw new ApiClientError(
        'This track could not be resolved by InnerTube, Piped, Invidious, or Audius. Tap Retry to rotate mirrors.',
        'STREAM_RESOLUTION_FAILED',
        error.attempts
      );
    }
    throw new ApiClientError(error instanceof Error ? error.message : 'Network error', 'NETWORK_ERROR');
  }
}

/* -------------------------------------------------------------------------- */
/* Local-only catalogue (used offline)                                          */
/* -------------------------------------------------------------------------- */

function localTracks(): Track[] {
  const { meta } = useDownloadsStore.getState();
  const offlineStore = useOfflineStore.getState();
  const library = useLibraryStore.getState();
  const seen = new Set<string>();
  const out: Track[] = [];

  const push = (track: Track) => {
    if (seen.has(track.videoId)) return;
    seen.add(track.videoId);
    out.push(track);
  };

  offlineStore.localTracks.forEach(push);
  Object.values(meta)
    .sort((a, b) => b.downloadedAt - a.downloadedAt)
    .forEach((item) => push(item.track));
  library.favorites.forEach(push);
  library.recents.forEach(push);
  return out;
}

function searchLocal(query: string): SearchPayload {
  const needle = query.trim().toLowerCase();
  const tracks = localTracks().filter(
    (track) =>
      track.title.toLowerCase().includes(needle) ||
      track.artist.toLowerCase().includes(needle) ||
      (track.album ?? '').toLowerCase().includes(needle)
  );
  return { tracks, provider: 'local', query, fetchedAt: Date.now(), fromCache: true };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                   */
/* -------------------------------------------------------------------------- */

export async function searchTracks(query: string): Promise<SearchPayload> {
  if (isOffline()) {
    const local = searchLocal(query);
    if (local.tracks.length) return local;
    const stored = loadSearchResult(query);
    if (stored?.tracks.length) return { ...stored, fromCache: true };
    return local;
  }

  try {
    const data = await searchCatalog(query, 40);
    const localMatches = searchLocal(query).tracks.filter((t) => t.isLocalFile);
    if (localMatches.length) {
      const seen = new Set(localMatches.map((t) => t.videoId));
      data.tracks = [...localMatches, ...data.tracks.filter((t) => !seen.has(t.videoId))];
    }
    saveSearchResult(data);
    return data;
  } catch (error) {
    const stored = loadSearchResult(query);
    if (stored?.tracks.length) return { ...stored, fromCache: true };
    const local = searchLocal(query);
    if (local.tracks.length) return local;
    throw new ApiClientError(
      'No search provider responded. Check your connection or retry in a moment.',
      'SEARCH_FAILED',
      attemptsOf(error)
    );
  }
}

export async function discoverTracks(): Promise<SearchPayload> {
  if (isOffline()) {
    const stored = loadHomeFeed();
    if (stored?.tracks.length) return { ...stored, fromCache: true };
    const tracks = localTracks();
    if (tracks.length) {
      return { tracks, provider: 'local', query: 'offline library', fetchedAt: Date.now(), fromCache: true };
    }
    throw new ApiClientError('You are offline and nothing is saved on this device yet.', 'OFFLINE');
  }

  try {
    const data = await discoverCatalog('US', 30);
    saveHomeFeed(data);
    return data;
  } catch (error) {
    const stored = loadHomeFeed();
    if (stored?.tracks.length) return { ...stored, fromCache: true };
    const tracks = localTracks();
    if (tracks.length) {
      return { tracks, provider: 'local', query: 'offline library', fetchedAt: Date.now(), fromCache: true };
    }
    throw new ApiClientError(
      'Could not load the music feed. Retry to try another API instance.',
      'DISCOVERY_FAILED',
      attemptsOf(error)
    );
  }
}

export async function fetchLyrics(
  track: Pick<Track, 'videoId' | 'title' | 'artist' | 'duration'>,
  options: { force?: boolean } = {}
): Promise<LyricsPayload> {
  const customLyrics = useOfflineStore.getState().customLyrics[track.videoId];
  if (customLyrics) {
    return customLyrics;
  }

  if (!options.force) {
    const stored = getStoredLyrics(track.videoId);
    if (stored) return stored;
  }

  if (isOffline()) {
    const stored = getStoredLyrics(track.videoId);
    if (stored) return stored;
    throw new ApiClientError(
      'These lyrics were not saved for offline use. Import a .lrc file or open them once while online.',
      'OFFLINE'
    );
  }

  try {
    const data = await getLyrics({
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      duration: track.duration > 0 ? Math.round(track.duration) : undefined,
      refresh: options.force
    });
    storeLyrics(data);
    return data;
  } catch (error) {
    if (error instanceof LyricsNotFoundError) {
      throw new ApiClientError(error.message, 'NO_LYRICS', error.attempts);
    }
    const stored = getStoredLyrics(track.videoId);
    if (stored) return stored;
    throw new ApiClientError(
      'LRCLIB and lyrics.ovh could not be reached. Retry in a moment or import a local .lrc file.',
      'LYRICS_FAILED',
      attemptsOf(error)
    );
  }
}

export function clearClientStreamCache(): void {
  clientStreamCache.clear();
}
