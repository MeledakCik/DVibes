import type { SearchPayload, Track, TrackSource } from '@/lib/types';
import { isNative } from '@/lib/native/platform';
import { TtlCache } from './cache';
import { searchPiped, trendingPiped } from './piped';
import { searchInvidious, trendingInvidious } from './invidious';
import { searchInnerTube } from './innertube';
import { searchAudius, searchItunes, trendingAudius } from './audius';

const searchCache = new TtlCache<SearchPayload>(5 * 60 * 1000, 100);
const discoverCache = new TtlCache<SearchPayload>(3 * 60 * 1000, 10);

const DISCOVER_QUERY = 'lofi chill music';

function dedupe(tracks: Track[], limit: number): Track[] {
  const seen = new Set<string>();
  const result: Track[] = [];
  for (const track of tracks) {
    if (seen.has(track.videoId)) continue;
    seen.add(track.videoId);
    result.push(track);
    if (result.length >= limit) break;
  }
  return result;
}

function payload(tracks: Track[], provider: TrackSource, query: string, instance?: string): SearchPayload {
  return { tracks, provider, query, instance, fetchedAt: Date.now() };
}

type Step = {
  label: string;
  provider: TrackSource;
  run: () => Promise<{ tracks: Track[]; instance?: string }>;
};

async function walk(steps: Step[], query: string, limit: number, failure: string): Promise<SearchPayload> {
  const attempts: string[] = [];
  for (const step of steps) {
    try {
      const result = await step.run();
      if (result.tracks.length) {
        return payload(dedupe(result.tracks, limit), step.provider, query, result.instance);
      }
    } catch (error) {
      attempts.push(`${step.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const error = new Error(failure) as Error & { attempts?: string[] };
  error.attempts = attempts;
  throw error;
}

/**
 * Multi-layer search:
 * - In Tauri native, YouTube InnerTube is fast and reliable, backed up by Piped,
 *   Invidious, Audius, and iTunes.
 * - In a plain browser, Piped → Invidious → Audius → iTunes → InnerTube.
 */
export async function searchCatalog(query: string, limit = 40): Promise<SearchPayload> {
  const normalized = query.trim();
  if (!normalized) throw new Error('Search query is empty');

  const cacheKey = `${normalized.toLowerCase()}::${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const innerTubeStep: Step = {
    label: 'innertube',
    provider: 'innertube',
    run: async () => ({ tracks: await searchInnerTube(normalized, limit), instance: 'https://www.youtube.com' })
  };

  const steps: Step[] = isNative()
    ? [
        innerTubeStep,
        { label: 'piped/music_songs', provider: 'piped', run: () => searchPiped(normalized, 'music_songs', limit) },
        { label: 'piped/music_videos', provider: 'piped', run: () => searchPiped(normalized, 'music_videos', limit) },
        { label: 'invidious', provider: 'invidious', run: () => searchInvidious(normalized, limit) },
        { label: 'audius', provider: 'audius', run: () => searchAudius(normalized, limit) },
        { label: 'itunes', provider: 'itunes', run: () => searchItunes(normalized, limit) }
      ]
    : [
        { label: 'piped/music_songs', provider: 'piped', run: () => searchPiped(normalized, 'music_songs', limit) },
        { label: 'piped/music_videos', provider: 'piped', run: () => searchPiped(normalized, 'music_videos', limit) },
        { label: 'invidious', provider: 'invidious', run: () => searchInvidious(normalized, limit) },
        innerTubeStep,
        { label: 'audius', provider: 'audius', run: () => searchAudius(normalized, limit) },
        { label: 'itunes', provider: 'itunes', run: () => searchItunes(normalized, limit) }
      ];

  const data = await walk(steps, normalized, limit, 'Every search provider failed');
  searchCache.set(cacheKey, data);
  return data;
}

/** Home feed discovery across YouTube InnerTube, Piped, Invidious, and Audius. */
export async function discoverCatalog(region = 'US', limit = 30): Promise<SearchPayload> {
  const cacheKey = `${region}::${limit}`;
  const cached = discoverCache.get(cacheKey);
  if (cached) return cached;

  const innerTubeStep: Step = {
    label: 'innertube',
    provider: 'innertube',
    run: async () => ({
      tracks: await searchInnerTube(DISCOVER_QUERY, limit),
      instance: 'https://www.youtube.com'
    })
  };

  const steps: Step[] = isNative()
    ? [
        innerTubeStep,
        { label: 'piped/search', provider: 'piped', run: () => searchPiped(DISCOVER_QUERY, 'music_videos', limit) },
        { label: 'invidious/trending', provider: 'invidious', run: () => trendingInvidious(region, limit) },
        { label: 'piped/trending', provider: 'piped', run: () => trendingPiped(region, limit) },
        { label: 'audius/trending', provider: 'audius', run: () => trendingAudius(limit) }
      ]
    : [
        { label: 'piped/search', provider: 'piped', run: () => searchPiped(DISCOVER_QUERY, 'music_videos', limit) },
        { label: 'invidious/trending', provider: 'invidious', run: () => trendingInvidious(region, limit) },
        { label: 'piped/trending', provider: 'piped', run: () => trendingPiped(region, limit) },
        innerTubeStep,
        { label: 'audius/trending', provider: 'audius', run: () => trendingAudius(limit) }
      ];

  const data = await walk(steps, DISCOVER_QUERY, limit, 'Every discovery provider failed');
  discoverCache.set(cacheKey, data);
  return data;
}
