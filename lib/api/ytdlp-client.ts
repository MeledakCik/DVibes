import { ProviderError, type ResolvedStream, type Track } from '@/lib/types';
import { thumbnailFor, extractVideoId } from '@/lib/utils';
import { fetchJson, toPositiveNumber } from './http';
import { extractDirect, searchDirect } from './ytdlp-direct';

export function getBackendUrl(): string {
  return (process.env.YTDLP_BACKEND_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
}

interface BackendExtractResponse {
  ok?: boolean;
  audioUrl?: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  artist?: string;
  videoId?: string;
  mimeType?: string;
  expiresAt?: number;
  error?: string;
}

interface BackendSearchResponse {
  ok?: boolean;
  tracks?: Array<{
    videoId?: string;
    id?: string;
    title?: string;
    artist?: string;
    uploader?: string;
    thumbnail?: string;
    duration?: number;
  }>;
  error?: string;
}

export async function resolveWithBackend(videoId: string): Promise<ResolvedStream> {
  const base = getBackendUrl();
  const data = await fetchJson<BackendExtractResponse>(`${base}/api/extract`, {
    method: 'POST',
    body: JSON.stringify({ videoId, url: `https://www.youtube.com/watch?v=${videoId}` }),
    timeoutMs: 90_000
  });

  if (data.ok === false || !data.audioUrl) {
    throw new Error(data.error || 'yt-dlp backend returned no audio URL');
  }

  const id = extractVideoId(data.videoId) || videoId;

  return {
    videoId: id,
    audioUrl: data.audioUrl,
    title: data.title?.trim() || 'Untitled',
    artist: data.artist?.trim() || 'Unknown artist',
    thumbnail: data.thumbnail?.startsWith('http') ? data.thumbnail : thumbnailFor(id),
    duration: toPositiveNumber(data.duration),
    provider: 'ytdlp',
    expiresAt: data.expiresAt || Date.now() + 60 * 60 * 1000,
    mimeType: data.mimeType
  };
}

export async function searchWithBackend(query: string, limit = 25): Promise<Track[]> {
  const base = getBackendUrl();
  const data = await fetchJson<BackendSearchResponse>(
    `${base}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    { timeoutMs: 90_000 }
  );

  if (data.ok === false) throw new Error(data.error || 'yt-dlp backend search failed');
  if (!Array.isArray(data.tracks)) throw new Error('yt-dlp backend returned an invalid search payload');

  return data.tracks
    .map((item): Track | null => {
      const videoId = extractVideoId(item.videoId) || extractVideoId(item.id);
      if (!videoId) return null;
      const thumbnail = item.thumbnail?.startsWith('http') ? item.thumbnail : thumbnailFor(videoId);
      return {
        videoId,
        title: item.title?.trim() || 'Untitled',
        artist: item.artist?.trim() || item.uploader?.trim() || 'Unknown artist',
        thumbnail,
        duration: toPositiveNumber(item.duration),
        source: 'ytdlp'
      };
    })
    .filter((track): track is Track => !!track)
    .slice(0, limit);
}

export async function resolveWithYtDlp(videoId: string): Promise<ResolvedStream> {
  try {
    return await resolveWithBackend(videoId);
  } catch (backendError) {
    try {
      return await extractDirect(videoId);
    } catch (directError) {
      throw new ProviderError(
        'ytdlp',
        'yt-dlp extraction failed',
        `backend: ${backendError instanceof Error ? backendError.message : String(backendError)}; direct: ${
          directError instanceof Error ? directError.message : String(directError)
        }`
      );
    }
  }
}

export async function searchWithYtDlp(query: string, limit = 25): Promise<Track[]> {
  try {
    return await searchWithBackend(query, limit);
  } catch (backendError) {
    try {
      return await searchDirect(query, limit);
    } catch (directError) {
      throw new ProviderError(
        'ytdlp',
        'yt-dlp search failed',
        `backend: ${backendError instanceof Error ? backendError.message : String(backendError)}; direct: ${
          directError instanceof Error ? directError.message : String(directError)
        }`
      );
    }
  }
}

export async function checkBackend(): Promise<{
  online: boolean;
  version?: string;
  binary?: string;
  error?: string;
}> {
  try {
    const data = await fetchJson<{ ok?: boolean; ytdlp?: { version?: string; binary?: string } }>(
      `${getBackendUrl()}/health`,
      { timeoutMs: 2500 }
    );
    return {
      online: data.ok === true,
      version: data.ytdlp?.version,
      binary: data.ytdlp?.binary
    };
  } catch (error) {
    return { online: false, error: error instanceof Error ? error.message : 'unreachable' };
  }
}