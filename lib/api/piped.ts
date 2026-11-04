import { ProviderError, type ResolvedStream, type StreamCandidate, type Track } from '@/lib/types';
import { thumbnailFor } from '@/lib/utils';
import { getPipedInstances } from './instances';
import { rotateFetch } from './rotate';
import { fetchJson, toPositiveNumber } from './http';

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

/* -------------------------------------------------------------------------- */
/* Audius + iTunes CORS-Safe Fallback Layer                                    */
/* -------------------------------------------------------------------------- */

const AUDIUS_HOSTS = [
  'https://discoveryprovider.audius.co',
  'https://discoveryprovider2.audius.co',
  'https://discoveryprovider3.audius.co'
];
const APP_NAME = 'DVIBES';

interface AudiusTrackItem {
  id?: string;
  title?: string;
  duration?: number;
  play_count?: number;
  genre?: string;
  artwork?: {
    '150x150'?: string;
    '480x480'?: string;
    '1000x1000'?: string;
  };
  user?: {
    name?: string;
    handle?: string;
  };
}

interface AudiusListResponse {
  data?: AudiusTrackItem[];
}

interface ItunesTrackItem {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
}

interface ItunesSearchResponse {
  results?: ItunesTrackItem[];
}

const audiusTrackCache = new Map<string, Track>();
const itunesTrackCache = new Map<string, Track>();

function audiusStreamUrl(host: string, rawId: string): string {
  return `${host}/v1/tracks/${encodeURIComponent(rawId)}/stream?app_name=${APP_NAME}`;
}

function normalizeAudiusTrack(item: AudiusTrackItem, host: string): Track | null {
  const rawId = item.id ? String(item.id).trim() : '';
  if (!rawId || !/^[a-zA-Z0-9_-]+$/.test(rawId)) return null;
  const duration = toPositiveNumber(item.duration);
  if (duration <= 0) return null;

  const videoId = `audius-${rawId}`;
  const thumb =
    item.artwork?.['480x480'] ||
    item.artwork?.['1000x1000'] ||
    item.artwork?.['150x150'] ||
    '';
  const streamUrl = audiusStreamUrl(host, rawId);

  const track: Track = {
    videoId,
    title: item.title?.trim() || 'Untitled',
    artist: item.user?.name?.trim() || item.user?.handle?.trim() || 'Unknown artist',
    thumbnail: thumb,
    duration,
    source: 'audius',
    album: item.genre || undefined,
    views: toPositiveNumber(item.play_count) || undefined,
    directStreamUrl: streamUrl,
    fileFormat: 'MP3',
    bitrate: 320000
  };
  audiusTrackCache.set(videoId, track);
  return track;
}

export async function searchAudius(
  query: string,
  limit = 25
): Promise<{ tracks: Track[]; instance: string }> {
  let lastError: unknown = null;
  for (const host of AUDIUS_HOSTS) {
    try {
      const url = `${host}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${APP_NAME}`;
      const res = await fetchJson<AudiusListResponse>(url, { timeoutMs: 5000 });
      const items = Array.isArray(res.data) ? res.data : [];
      const tracks = items
        .map((item) => normalizeAudiusTrack(item, host))
        .filter((t): t is Track => !!t)
        .slice(0, limit);
      if (tracks.length) {
        return { tracks, instance: host };
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Audius search failed');
}

export async function trendingAudius(
  limit = 25
): Promise<{ tracks: Track[]; instance: string }> {
  let lastError: unknown = null;
  for (const host of AUDIUS_HOSTS) {
    try {
      const url = `${host}/v1/tracks/trending?app_name=${APP_NAME}`;
      const res = await fetchJson<AudiusListResponse>(url, { timeoutMs: 5000 });
      const items = Array.isArray(res.data) ? res.data : [];
      const tracks = items
        .map((item) => normalizeAudiusTrack(item, host))
        .filter((t): t is Track => !!t)
        .slice(0, limit);
      if (tracks.length) {
        return { tracks, instance: host };
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Audius trending failed');
}

export async function searchItunes(
  query: string,
  limit = 20
): Promise<{ tracks: Track[]; instance: string }> {
  const url = `https://itunes.apple.com/search?media=music&entity=song&limit=${limit}&term=${encodeURIComponent(query)}`;
  const res = await fetchJson<ItunesSearchResponse>(url, { timeoutMs: 5000 });
  const results = Array.isArray(res.results) ? res.results : [];
  const tracks: Track[] = [];

  for (const item of results) {
    if (!item.trackId || !item.previewUrl?.startsWith('http')) continue;
    const videoId = `itunes-${item.trackId}`;
    const thumb = item.artworkUrl100
      ? item.artworkUrl100.replace('100x100bb', '600x600bb')
      : '';
    const track: Track = {
      videoId,
      title: item.trackName?.trim() || 'Untitled',
      artist: item.artistName?.trim() || 'Unknown artist',
      album: item.collectionName?.trim() || undefined,
      thumbnail: thumb,
      duration: 30,
      source: 'itunes',
      directStreamUrl: item.previewUrl,
      fileFormat: 'M4A',
      bitrate: 256000
    };
    itunesTrackCache.set(videoId, track);
    tracks.push(track);
  }

  if (!tracks.length) {
    throw new Error('iTunes returned no playable tracks');
  }
  return { tracks, instance: 'https://itunes.apple.com' };
}

export async function resolveAudiusStream(videoId: string): Promise<ResolvedStream> {
  const rawId = videoId.replace(/^audius-/, '');
  const cachedTrack = audiusTrackCache.get(videoId);
  const candidates: StreamCandidate[] = AUDIUS_HOSTS.map((host) => ({
    url: audiusStreamUrl(host, rawId),
    provider: 'audius',
    mimeType: 'audio/mpeg',
    bitrate: 320000
  }));

  return {
    videoId,
    audioUrl: candidates[0].url,
    title: cachedTrack?.title || 'Audius Stream',
    artist: cachedTrack?.artist || 'Audius Artist',
    thumbnail: cachedTrack?.thumbnail || '',
    duration: cachedTrack?.duration || 0,
    provider: 'audius',
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    mimeType: 'audio/mpeg',
    bitrate: 320000,
    candidates
  };
}

export async function resolveItunesStream(videoId: string): Promise<ResolvedStream> {
  const cached = itunesTrackCache.get(videoId);
  if (cached?.directStreamUrl) {
    return {
      videoId,
      audioUrl: cached.directStreamUrl,
      title: cached.title,
      artist: cached.artist,
      thumbnail: cached.thumbnail,
      duration: cached.duration || 30,
      provider: 'itunes',
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
      mimeType: 'audio/mp4',
      bitrate: 256000,
      candidates: [
        {
          url: cached.directStreamUrl,
          provider: 'itunes',
          mimeType: 'audio/mp4',
          bitrate: 256000
        }
      ]
    };
  }

  const rawId = videoId.replace(/^itunes-/, '');
  const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(rawId)}&entity=song`;
  const res = await fetchJson<ItunesSearchResponse>(url, { timeoutMs: 5000 });
  const item = res.results?.find((r) => r.previewUrl?.startsWith('http'));
  if (!item?.previewUrl) {
    throw new ProviderError('itunes', 'iTunes preview stream not found');
  }

  return {
    videoId,
    audioUrl: item.previewUrl,
    title: item.trackName || 'Untitled',
    artist: item.artistName || 'Unknown artist',
    thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : '',
    duration: 30,
    provider: 'itunes',
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    mimeType: 'audio/mp4',
    bitrate: 256000,
    candidates: [
      {
        url: item.previewUrl,
        provider: 'itunes',
        mimeType: 'audio/mp4',
        bitrate: 256000
      }
    ]
  };
}

export async function resolveFallbackByMeta(
  videoId: string,
  title?: string,
  artist?: string
): Promise<ResolvedStream> {
  const query = [title, artist]
    .filter(Boolean)
    .join(' ')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!query) {
    throw new ProviderError('audius', 'No title/artist metadata available for fallback');
  }

  try {
    const audius = await searchAudius(query, 5);
    const first = audius.tracks[0];
    if (first?.directStreamUrl) {
      const rawId = first.videoId.replace(/^audius-/, '');
      const candidates: StreamCandidate[] = AUDIUS_HOSTS.map((host) => ({
        url: audiusStreamUrl(host, rawId),
        provider: 'audius',
        mimeType: 'audio/mpeg',
        bitrate: 320000
      }));
      return {
        videoId,
        audioUrl: candidates[0].url,
        title: title || first.title,
        artist: artist || first.artist,
        thumbnail: first.thumbnail,
        duration: first.duration,
        provider: 'audius',
        expiresAt: Date.now() + 2 * 60 * 60 * 1000,
        mimeType: 'audio/mpeg',
        bitrate: 320000,
        candidates
      };
    }
  } catch {
    // try iTunes next
  }

  const itunes = await searchItunes(query, 5);
  const best = itunes.tracks[0];
  if (!best?.directStreamUrl) {
    throw new ProviderError('itunes', 'No fallback stream found on Audius or iTunes');
  }

  return {
    videoId,
    audioUrl: best.directStreamUrl,
    title: title || best.title,
    artist: artist || best.artist,
    thumbnail: best.thumbnail,
    duration: best.duration || 30,
    provider: 'itunes',
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    mimeType: 'audio/mp4',
    bitrate: 256000,
    candidates: [
      {
        url: best.directStreamUrl,
        provider: 'itunes',
        mimeType: 'audio/mp4',
        bitrate: 256000
      }
    ]
  };
}
