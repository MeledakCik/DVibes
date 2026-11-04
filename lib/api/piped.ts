import { ProviderError, type ResolvedStream, type StreamCandidate, type Track } from '@/lib/types';
import { thumbnailFor } from '@/lib/utils';
import { getPipedInstances } from './instances';
import { rotateFetch } from './rotate';
import { toPositiveNumber } from './http';

interface PipedStreamItem {
  url?: string;
  type?: string;
  title?: string;
  thumbnail?: string;
  uploaderName?: string;
  uploader?: string;
  duration?: number;
  views?: number;
  uploadedDate?: string;
}

interface PipedSearchResponse {
  items?: PipedStreamItem[];
  nextpage?: string | null;
}

interface PipedAudioStream {
  url?: string;
  bitrate?: number;
  mimeType?: string;
  codec?: string;
  quality?: string;
  contentLength?: number;
  videoOnly?: boolean;
}

interface PipedStreamsResponse {
  title?: string;
  uploader?: string;
  thumbnailUrl?: string;
  duration?: number;
  audioStreams?: PipedAudioStream[];
  livestream?: boolean;
}

function videoIdFromUrl(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];
  const short = value.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  return short ? short[1] : null;
}

export function normalizePipedItem(item: PipedStreamItem): Track | null {
  const videoId = videoIdFromUrl(item.url);
  if (!videoId) return null;
  if (item.type && item.type !== 'stream' && item.type !== 'video') return null;

  return {
    videoId,
    title: item.title?.trim() || 'Untitled',
    artist: item.uploaderName?.trim() || item.uploader?.trim() || 'Unknown artist',
    thumbnail: item.thumbnail?.startsWith('http') ? item.thumbnail : thumbnailFor(videoId),
    duration: toPositiveNumber(item.duration),
    source: 'piped',
    views: toPositiveNumber(item.views) || undefined,
    uploadedAt: item.uploadedDate
  };
}

export async function searchPiped(
  query: string,
  filter: 'music_songs' | 'music_videos' | 'videos' = 'music_songs',
  limit = 30
): Promise<{ tracks: Track[]; instance: string }> {
  const path = `/search?q=${encodeURIComponent(query)}&filter=${filter}`;
  const { data, instance } = await rotateFetch<PipedSearchResponse>(getPipedInstances(), {
    timeoutMs: 5000,
    buildPath: (base) => `${base}${path}`
  });

  const items = Array.isArray(data.items) ? data.items : [];
  const seen = new Set<string>();
  const tracks: Track[] = [];

  for (const item of items) {
    const track = normalizePipedItem(item);
    if (!track || seen.has(track.videoId)) continue;
    if (track.duration > 6 * 60 * 60) continue;
    seen.add(track.videoId);
    tracks.push(track);
    if (tracks.length >= limit) break;
  }

  return { tracks, instance };
}

export async function trendingPiped(
  region = 'US',
  limit = 30
): Promise<{ tracks: Track[]; instance: string }> {
  const { data, instance } = await rotateFetch<PipedStreamItem[]>(getPipedInstances(), {
    timeoutMs: 5000,
    buildPath: (base) => `${base}/trending?region=${encodeURIComponent(region)}`,
    validate: (value) => Array.isArray(value)
  });

  const tracks = data
    .map(normalizePipedItem)
    .filter((track): track is Track => !!track)
    .slice(0, limit);

  return { tracks, instance };
}

function rankAudioStreams(streams: PipedAudioStream[]): PipedAudioStream[] {
  const playable = streams.filter(
    (stream) => stream.url && stream.url.startsWith('http') && !stream.videoOnly
  );

  playable.sort((a, b) => {
    const aM4a = a.mimeType?.includes('audio/mp4') ? 1 : 0;
    const bM4a = b.mimeType?.includes('audio/mp4') ? 1 : 0;
    if (aM4a !== bM4a) return bM4a - aM4a;
    return (b.bitrate ?? 0) - (a.bitrate ?? 0);
  });

  return playable;
}

export async function resolvePiped(videoId: string): Promise<ResolvedStream> {
  const { data, instance } = await rotateFetch<PipedStreamsResponse>(getPipedInstances(), {
    timeoutMs: 5000,
    buildPath: (base) => `${base}/streams/${encodeURIComponent(videoId)}`,
    validate: (value) => Array.isArray(value.audioStreams) && value.audioStreams.length > 0
  });

  const ranked = rankAudioStreams(data.audioStreams ?? []);
  const stream = ranked[0];
  if (!stream?.url) {
    throw new ProviderError('piped', 'Piped returned no playable audio stream', instance);
  }

  const candidates: StreamCandidate[] = ranked.slice(0, 4).map((s) => ({
    url: s.url!,
    provider: 'piped',
    mimeType: s.mimeType,
    bitrate: s.bitrate
  }));

  return {
    videoId,
    audioUrl: stream.url,
    title: data.title?.trim() || 'Untitled',
    artist: data.uploader?.trim() || 'Unknown artist',
    thumbnail: data.thumbnailUrl?.startsWith('http') ? data.thumbnailUrl : thumbnailFor(videoId),
    duration: toPositiveNumber(data.duration),
    provider: 'piped',
    expiresAt: Date.now() + 60 * 60 * 1000,
    mimeType: stream.mimeType,
    bitrate: stream.bitrate,
    candidates
  };
}
