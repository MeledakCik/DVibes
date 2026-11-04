import { ProviderError, type ResolvedStream, type StreamCandidate, type Track } from '@/lib/types';
import { thumbnailFor } from '@/lib/utils';
import { nativeFetch } from '@/lib/native/platform';
import { toPositiveNumber } from './http';

/**
 * Talks to YouTube's InnerTube API directly from the device via Tauri's
 * CORS-free Rust HTTP client (`nativeFetch`).
 *
 * Uses a multi-client rotation for `/player`:
 *   1. ANDROID_VR (1.60.19) — returns direct unciphered audio/mp4 & audio/webm without poToken
 *   2. IOS (19.45.4) — returns direct audio/mp4 (m4a) streams ideal for Apple & desktop WebViews
 *   3. ANDROID (19.44.38) — standard Android InnerTube client
 *   4. TVHTML5_SIMPLY_EMBEDDED_PLAYER (2.0) — embedded fallback for age/music-restricted tracks
 */

const ENDPOINT = 'https://www.youtube.com/youtubei/v1';

const WEB_CONTEXT = {
  client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'en', gl: 'US' }
};

export const ANDROID_VR_UA =
  'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';
export const IOS_UA =
  'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)';
export const ANDROID_UA =
  'com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip';

interface InnerTubeClientProfile {
  name: string;
  userAgent: string;
  clientId: string;
  clientVersion: string;
  context: Record<string, unknown>;
}

const PLAYER_CLIENTS: InnerTubeClientProfile[] = [
  {
    name: 'ANDROID_VR',
    userAgent: ANDROID_VR_UA,
    clientId: '28',
    clientVersion: '1.60.19',
    context: {
      client: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.60.19',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
        androidSdkVersion: 32,
        osName: 'Android',
        osVersion: '12L',
        hl: 'en',
        gl: 'US'
      }
    }
  },
  {
    name: 'IOS',
    userAgent: IOS_UA,
    clientId: '5',
    clientVersion: '19.45.4',
    context: {
      client: {
        clientName: 'IOS',
        clientVersion: '19.45.4',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iPhone',
        osVersion: '18.1.0.22B83',
        hl: 'en',
        gl: 'US'
      }
    }
  },
  {
    name: 'ANDROID',
    userAgent: ANDROID_UA,
    clientId: '3',
    clientVersion: '19.44.38',
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.44.38',
        androidSdkVersion: 34,
        osName: 'Android',
        osVersion: '14',
        hl: 'en',
        gl: 'US'
      }
    }
  },
  {
    name: 'TV_EMBED',
    userAgent:
      'Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15',
    clientId: '85',
    clientVersion: '2.0',
    context: {
      client: {
        clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
        clientVersion: '2.0',
        hl: 'en',
        gl: 'US'
      },
      thirdParty: {
        embedUrl: 'https://www.youtube.com/'
      }
    }
  }
];

async function post<T>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 7500
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await nativeFetch(`${ENDPOINT}${path}?prettyPrint=false`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        origin: 'https://www.youtube.com',
        ...headers
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`InnerTube HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

interface TextRuns {
  simpleText?: string;
  runs?: Array<{ text?: string }>;
}

interface VideoRenderer {
  videoId?: string;
  title?: TextRuns;
  ownerText?: TextRuns;
  longBylineText?: TextRuns;
  lengthText?: TextRuns;
  viewCountText?: TextRuns;
  publishedTimeText?: TextRuns;
  thumbnail?: { thumbnails?: Array<{ url?: string; width?: number }> };
}

function runsText(value: TextRuns | undefined): string {
  if (!value) return '';
  if (value.simpleText) return value.simpleText;
  return (value.runs ?? []).map((run) => run.text ?? '').join('');
}

function parseClock(value: string): number {
  if (!value) return 0;
  const parts = value.split(':').map((part) => Number(part));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function collectVideoRenderers(node: unknown, out: VideoRenderer[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectVideoRenderers(item, out);
    return;
  }
  const record = node as Record<string, unknown>;
  if (record.videoRenderer && typeof record.videoRenderer === 'object') {
    out.push(record.videoRenderer as VideoRenderer);
  }
  for (const key of Object.keys(record)) {
    if (key === 'videoRenderer') continue;
    collectVideoRenderers(record[key], out);
  }
}

export async function searchInnerTube(query: string, limit = 30): Promise<Track[]> {
  const data = await post<unknown>('/search', {
    context: WEB_CONTEXT,
    query,
    // "Videos" filter — keeps channels/playlists out of the grid.
    params: 'EgIQAQ%3D%3D'
  });

  const renderers: VideoRenderer[] = [];
  collectVideoRenderers(data, renderers);

  const seen = new Set<string>();
  const tracks: Track[] = [];
  for (const item of renderers) {
    const videoId = item.videoId;
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId) || seen.has(videoId)) continue;
    const duration = parseClock(runsText(item.lengthText));
    if (duration <= 0 || duration > 6 * 60 * 60) continue; // skip live streams / shorts oddities
    seen.add(videoId);

    const thumbs = item.thumbnail?.thumbnails ?? [];
    const thumb = [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;

    tracks.push({
      videoId,
      title: runsText(item.title).trim() || 'Untitled',
      artist: (runsText(item.ownerText) || runsText(item.longBylineText)).trim() || 'Unknown artist',
      thumbnail: thumb?.startsWith('http') ? thumb : thumbnailFor(videoId),
      duration,
      source: 'innertube',
      uploadedAt: runsText(item.publishedTimeText) || undefined
    });
    if (tracks.length >= limit) break;
  }
  return tracks;
}

/* -------------------------------------------------------------------------- */
/* Stream resolution                                                           */
/* -------------------------------------------------------------------------- */

interface PlayerFormat {
  url?: string;
  signatureCipher?: string;
  mimeType?: string;
  bitrate?: number;
  contentLength?: string;
  audioQuality?: string;
}

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: {
    title?: string;
    author?: string;
    lengthSeconds?: string;
    thumbnail?: { thumbnails?: Array<{ url?: string; width?: number }> };
  };
  streamingData?: {
    expiresInSeconds?: string;
    adaptiveFormats?: PlayerFormat[];
    formats?: PlayerFormat[];
  };
}

function rankFormats(formats: PlayerFormat[]): PlayerFormat[] {
  const audio = formats.filter(
    (f) => typeof f.url === 'string' && f.url.startsWith('http') && (f.mimeType ?? '').startsWith('audio/')
  );
  audio.sort((a, b) => {
    const aM4a = (a.mimeType ?? '').includes('audio/mp4') ? 1 : 0;
    const bM4a = (b.mimeType ?? '').includes('audio/mp4') ? 1 : 0;
    if (aM4a !== bM4a) return bM4a - aM4a; // m4a plays everywhere, incl. iOS/Safari
    return (b.bitrate ?? 0) - (a.bitrate ?? 0);
  });
  return audio;
}

export async function resolveInnerTube(videoId: string): Promise<ResolvedStream> {
  const errors: string[] = [];

  for (const profile of PLAYER_CLIENTS) {
    try {
      const data = await post<PlayerResponse>(
        '/player',
        {
          context: profile.context,
          videoId,
          contentCheckOk: true,
          racyCheckOk: true
        },
        {
          'user-agent': profile.userAgent,
          'x-youtube-client-name': profile.clientId,
          'x-youtube-client-version': profile.clientVersion
        }
      );

      const status = data.playabilityStatus?.status;
      if (status && status !== 'OK') {
        errors.push(`${profile.name}: ${data.playabilityStatus?.reason || status}`);
        continue;
      }

      const formats = [...(data.streamingData?.adaptiveFormats ?? []), ...(data.streamingData?.formats ?? [])];
      const ranked = rankFormats(formats);
      if (!ranked.length || !ranked[0].url) {
        errors.push(`${profile.name}: no direct audio URL`);
        continue;
      }

      const best = ranked[0];
      const expires = Number(data.streamingData?.expiresInSeconds) || 6 * 60 * 60;
      const thumbs = data.videoDetails?.thumbnail?.thumbnails ?? [];
      const thumb = [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;

      const candidates: StreamCandidate[] = ranked.slice(0, 4).map((fmt) => ({
        url: fmt.url!,
        provider: 'innertube',
        mimeType: fmt.mimeType,
        bitrate: fmt.bitrate,
        userAgent: profile.userAgent
      }));

      return {
        videoId,
        audioUrl: best.url!,
        title: data.videoDetails?.title?.trim() || 'Untitled',
        artist: data.videoDetails?.author?.trim() || 'Unknown artist',
        thumbnail: thumb?.startsWith('http') ? thumb : thumbnailFor(videoId),
        duration: toPositiveNumber(data.videoDetails?.lengthSeconds),
        provider: 'innertube',
        expiresAt: Date.now() + Math.max(60, expires - 300) * 1000,
        mimeType: best.mimeType,
        bitrate: best.bitrate,
        userAgent: profile.userAgent,
        candidates
      };
    } catch (error) {
      errors.push(`${profile.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new ProviderError('innertube', `YouTube InnerTube failed (${errors.join('; ')})`);
}
