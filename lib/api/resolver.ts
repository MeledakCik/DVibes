import type { ResolvedStream, StreamCandidate } from '@/lib/types';
import { TtlCache } from './cache';
import { isYouTubeVideoId } from '@/lib/utils';
import { isNative } from '@/lib/native/platform';
import { resolvePiped } from './piped';
import { resolveInvidious } from './invidious';
import { resolveInnerTube } from './innertube';
import {
  resolveAudiusStream,
  resolveFallbackByMeta,
  resolveItunesStream
} from './audius';

const ONE_HOUR = 60 * 60 * 1000;
const streamCache = new TtlCache<ResolvedStream>(ONE_HOUR, 300);
const inFlight = new Map<string, Promise<ResolvedStream>>();

export class StreamResolutionError extends Error {
  attempts: string[];

  constructor(message: string, attempts: string[]) {
    super(message);
    this.name = 'StreamResolutionError';
    this.attempts = attempts;
  }
}

export interface ResolveOptions {
  force?: boolean;
  title?: string;
  artist?: string;
  directStreamUrl?: string;
}

/**
 * Multi-layer stream resolver with candidate pooling:
 * - For `audius-*` and `itunes-*` track IDs, resolves directly from Audius/iTunes.
 * - For YouTube video IDs:
 *   - Inside the native Tauri shell (`isNative()`), tries `InnerTube` FIRST
 *     (direct on-device YouTube API signed for the user's own IP), then `Piped`,
 *     then `Invidious`.
 *   - In a normal browser, tries `Piped` → `Invidious` → `InnerTube`.
 *   - Also collects backup stream candidates so if the primary URL is rejected by
 *     `<audio>`, the player automatically fails over to the next candidate or
 *     caches via Rust.
 */
export async function resolveStream(
  videoId: string,
  options: ResolveOptions = {}
): Promise<{ stream: ResolvedStream; cached: boolean }> {
  if (options.force) {
    streamCache.delete(videoId);
  } else {
    const cached = streamCache.get(videoId);
    if (cached) return { stream: cached, cached: true };
  }

  const existing = inFlight.get(videoId);
  if (existing) return { stream: await existing, cached: false };

  const task = (async () => {
    // 1. Direct Audius or iTunes track IDs
    if (videoId.startsWith('audius-')) {
      const stream = await resolveAudiusStream(videoId);
      streamCache.set(videoId, stream);
      return stream;
    }

    if (videoId.startsWith('itunes-')) {
      const stream = await resolveItunesStream(videoId);
      streamCache.set(videoId, stream);
      return stream;
    }

    if (!isYouTubeVideoId(videoId)) {
      if (options.directStreamUrl) {
        const direct: ResolvedStream = {
          videoId,
          audioUrl: options.directStreamUrl,
          title: options.title || 'Untitled',
          artist: options.artist || 'Unknown artist',
          thumbnail: '',
          duration: 0,
          provider: 'local',
          expiresAt: Date.now() + ONE_HOUR
        };
        return direct;
      }
      throw new StreamResolutionError('Invalid track id', []);
    }

    const attempts: string[] = [];
    const resolvedStreams: ResolvedStream[] = [];

    // Order providers intelligently: in Tauri native, InnerTube is fastest and signed
    // for the user's IP. In browser, Piped/Invidious avoid browser CORS on youtubei.
    const steps: Array<{ name: string; run: () => Promise<ResolvedStream> }> = isNative()
      ? [
          { name: 'innertube', run: () => resolveInnerTube(videoId) },
          { name: 'piped', run: () => resolvePiped(videoId) },
          { name: 'invidious', run: () => resolveInvidious(videoId) }
        ]
      : [
          { name: 'piped', run: () => resolvePiped(videoId) },
          { name: 'invidious', run: () => resolveInvidious(videoId) },
          { name: 'innertube', run: () => resolveInnerTube(videoId) }
        ];

    for (const step of steps) {
      try {
        const result = await step.run();
        resolvedStreams.push(result);
        // Once we have a primary stream, also kick off ONE backup provider with a short
        // timeout if we only have a single source, or break immediately if we have multiple
        // candidates.
        if (resolvedStreams.length >= 1) {
          break;
        }
      } catch (error) {
        attempts.push(`${step.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // If primary succeeded, also try to gather backup candidates from remaining steps in parallel
    // (best-effort, capped at 1800ms) so `<audio>` has cross-provider failover URLs ready.
    if (resolvedStreams.length > 0) {
      const primary = resolvedStreams[0];
      const remainingSteps = steps.filter((s) => s.name !== primary.provider);
      try {
        const extra = await Promise.race([
          Promise.any(remainingSteps.map((s) => s.run())),
          new Promise<null>((r) => setTimeout(() => r(null), 1800))
        ]);
        if (extra) {
          resolvedStreams.push(extra);
        }
      } catch {
        // backup is optional
      }

      const allCandidates: StreamCandidate[] = [];
      const seenUrls = new Set<string>();
      for (const s of resolvedStreams) {
        const list = s.candidates?.length
          ? s.candidates
          : [
              {
                url: s.audioUrl,
                provider: s.provider,
                mimeType: s.mimeType,
                bitrate: s.bitrate,
                userAgent: s.userAgent
              }
            ];
        for (const c of list) {
          if (!c.url || seenUrls.has(c.url)) continue;
          seenUrls.add(c.url);
          allCandidates.push(c);
        }
      }

      const merged: ResolvedStream = {
        ...primary,
        candidates: allCandidates
      };
      streamCache.set(videoId, merged);
      return merged;
    }

    // Final safety net: if YouTube/Piped/Invidious all failed and we know the song's
    // title/artist, try resolving a matching stream from Audius / iTunes.
    if (options.title) {
      try {
        const fallback = await resolveFallbackByMeta(videoId, options.title, options.artist);
        streamCache.set(videoId, fallback);
        return fallback;
      } catch (fallbackErr) {
        attempts.push(
          `audius/itunes: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`
        );
      }
    }

    throw new StreamResolutionError('All stream providers failed', attempts);
  })().finally(() => {
    inFlight.delete(videoId);
  });

  inFlight.set(videoId, task);
  return { stream: await task, cached: false };
}

export function getCachedStream(videoId: string): ResolvedStream | null {
  return streamCache.get(videoId);
}

export function invalidateCachedStream(videoId: string): void {
  streamCache.delete(videoId);
}
