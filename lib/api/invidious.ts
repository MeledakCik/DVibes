import instancesFile from '@/invidious-instances.json';
import { ProviderError, type ResolvedStream, type StreamCandidate, type Track } from '@/lib/types';
import { thumbnailFor } from '@/lib/utils';
import { prioritize } from './instances';
import { rotateFetch } from './rotate';
import { toPositiveNumber } from './http';

interface InvidiousThumbnail {
  url?: string;
  quality?: string;
  width?: number;
  height?: number;
}

interface InvidiousVideoItem {
  type?: string;
  videoId?: string;
  title?: string;
  author?: string;
  lengthSeconds?: number;
  viewCount?: number;
  publishedText?: string;
  videoThumbnails?: InvidiousThumbnail[];
}

interface InvidiousSearchResponse extends Array<InvidiousVideoItem> {}

interface InvidiousFormat {
  url?: string;
  signatureCipher?: string;
  cipher?: string;
  bitrate?: string | number;
  type?: string;
  mimeType?: string;
  audioQuality?: string;
  itag?: string | number;
  contentLength?: string | number;
}

interface InvidiousVideoResponse {
  title?: string;
  author?: string;
  lengthSeconds?: number;
  videoThumbnails?: InvidiousThumbnail[];
  adaptiveFormats?: InvidiousFormat[];
  formatStreams?: InvidiousFormat[];
}

function getInvidiousInstances(): string[] {
  const fromFile = instancesFile.instances
    .filter((instance) => instance.enabled)
    .map((instance) => instance.baseUrl.replace(/\/+$/, ''));

  return prioritize(fromFile);
}

function bestThumbnail(thumbs: InvidiousThumbnail[] | undefined, videoId: string): string {
  if (!thumbs?.length) return thumbnailFor(videoId);
  const sorted = [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const found = sorted.find((thumb) => thumb.url?.startsWith('http'));
  return found?.url || thumbnailFor(videoId);
}

export function normalizeInvidiousItem(item: InvidiousVideoItem): Track | null {
  if (!item.videoId || !/^[a-zA-Z0-9_-]{11}$/.test(item.videoId)) return null;
  if (item.type && item.type !== 'video') return null;

  return {
    videoId: item.videoId,
    title: item.title?.trim() || 'Untitled',
    artist: item.author?.trim() || 'Unknown artist',
    thumbnail: bestThumbnail(item.videoThumbnails, item.videoId),
    duration: toPositiveNumber(item.lengthSeconds),
    source: 'invidious',
    views: toPositiveNumber(item.viewCount) || undefined,
    uploadedAt: item.publishedText
  };
}

export async function searchInvidious(
  query: string,
  limit = 30
): Promise<{ tracks: Track[]; instance: string }> {
  const path = `/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
  const { data, instance } = await rotateFetch<InvidiousSearchResponse>(getInvidiousInstances(), {
    timeoutMs: 5000,
    buildPath: (base) => `${base}${path}`,
    validate: (value) => Array.isArray(value)
  });

  const seen = new Set<string>();
  const tracks: Track[] = [];
  for (const item of data) {
    const track = normalizeInvidiousItem(item);
    if (!track || seen.has(track.videoId)) continue;
    if (track.duration > 6 * 60 * 60) continue;
    seen.add(track.videoId);
    tracks.push(track);
    if (tracks.length >= limit) break;
  }

  return { tracks, instance };
}

export async function trendingInvidious(
  region = 'US',
  limit = 30
): Promise<{ tracks: Track[]; instance: string }> {
  const path = `/api/v1/trending?type=Music&region=${encodeURIComponent(region)}`;
  const { data, instance } = await rotateFetch<InvidiousSearchResponse>(getInvidiousInstances(), {
    timeoutMs: 5000,
    buildPath: (base) => `${base}${path}`,
    validate: (value) => Array.isArray(value)
  });

  const tracks = data
    .map(normalizeInvidiousItem)
    .filter((track): track is Track => !!track)
    .slice(0, limit);

  return { tracks, instance };
}

function rankAudioFormats(formats: InvidiousFormat[] | undefined): InvidiousFormat[] {
  if (!formats?.length) return [];

  const audio = formats.filter((format) => {
    const mime = format.type || format.mimeType || '';
    return mime.startsWith('audio/') && typeof format.url === 'string' && format.url.startsWith('http');
  });

  audio.sort((a, b) => {
    const aM4a = (a.type || a.mimeType || '').includes('audio/mp4') ? 1 : 0;
    const bM4a = (b.type || b.mimeType || '').includes('audio/mp4') ? 1 : 0;
    if (aM4a !== bM4a) return bM4a - aM4a;
    return Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0);
  });

  return audio;
}

function extractItag(format: InvidiousFormat): string | null {
  if (format.itag !== undefined && format.itag !== null && String(format.itag).trim()) {
    return String(format.itag).trim();
  }
  if (format.url) {
    const match = format.url.match(/[?&]itag=(\d+)/);
    if (match) return match[1];
  }
  return null;
}

export async function resolveInvidious(videoId: string): Promise<ResolvedStream> {
  const { data, instance } = await rotateFetch<InvidiousVideoResponse>(getInvidiousInstances(), {
    timeoutMs: 5000,
    buildPath: (base) => `${base}/api/v1/videos/${encodeURIComponent(videoId)}?local=true`,
    validate: (value) => {
      const audio = (value.adaptiveFormats ?? []).some(
        (format) =>
          (format.type || format.mimeType || '').startsWith('audio/') &&
          typeof format.url === 'string' &&
          format.url.startsWith('http')
      );
      const muxed = (value.formatStreams ?? []).some(
        (format) => typeof format.url === 'string' && format.url.startsWith('http')
      );
      return audio || muxed;
    }
  });

  const rankedAudio = rankAudioFormats(data.adaptiveFormats);
  const muxed = (data.formatStreams ?? []).filter(
    (format) => typeof format.url === 'string' && format.url.startsWith('http')
  );

  const chosen = rankedAudio[0] || muxed[0];
  if (!chosen?.url) {
    throw new ProviderError('invidious', 'Invidious returned no playable audio format', instance);
  }

  const baseHost = instance.replace(/\/+$/, '');
  const candidates: StreamCandidate[] = [];

  // Raw googlevideo.com URLs returned by Invidious are IP-locked to the Invidious server's IP.
  // Using Invidious's `/latest_version?id=...&itag=...&local=true` endpoint proxies the bytes
  // through the Invidious instance so the client never gets HTTP 403 Forbidden from googlevideo.com.
  for (const fmt of [...rankedAudio.slice(0, 3), ...muxed.slice(0, 1)]) {
    const mime = fmt.type || fmt.mimeType || 'audio/mp4';
    const bitrate = Number(fmt.bitrate) || undefined;
    const itag = extractItag(fmt);
    if (itag) {
      candidates.push({
        url: `${baseHost}/latest_version?id=${encodeURIComponent(videoId)}&itag=${encodeURIComponent(itag)}&local=true`,
        provider: 'invidious',
        mimeType: mime,
        bitrate
      });
    }
    if (fmt.url) {
      const resolvedUrl = fmt.url.startsWith('/') ? `${baseHost}${fmt.url}` : fmt.url;
      candidates.push({
        url: resolvedUrl,
        provider: 'invidious',
        mimeType: mime,
        bitrate
      });
    }
  }

  const primary = candidates[0] ?? {
    url: chosen.url,
    provider: 'invidious' as const,
    mimeType: chosen.type || chosen.mimeType || 'audio/mp4',
    bitrate: Number(chosen.bitrate) || undefined
  };

  return {
    videoId,
    audioUrl: primary.url,
    title: data.title?.trim() || 'Untitled',
    artist: data.author?.trim() || 'Unknown artist',
    thumbnail: bestThumbnail(data.videoThumbnails, videoId),
    duration: toPositiveNumber(data.lengthSeconds),
    provider: 'invidious',
    expiresAt: Date.now() + 60 * 60 * 1000,
    mimeType: primary.mimeType,
    bitrate: primary.bitrate,
    candidates
  };
}

export function getConfiguredInvidiousInstances(): string[] {
  return getInvidiousInstances();
}
