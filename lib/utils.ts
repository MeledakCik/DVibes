import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatViews(views: number | undefined): string | null {
  if (!views || !Number.isFinite(views) || views <= 0) return null;
  if (views >= 1_000_000_000) return `${(views / 1_000_000_000).toFixed(1)}B views`;
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K views`;
  return `${views} views`;
}

export function thumbnailFor(videoId: string): string {
  if (videoId.startsWith('local-') || videoId.startsWith('audius-') || videoId.startsWith('itunes-')) {
    return '';
  }
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function isYouTubeVideoId(value: string | null | undefined): boolean {
  return !!value && /^[a-zA-Z0-9_-]{11}$/.test(value);
}

export function isValidTrackId(value: string | null | undefined): boolean {
  return !!value && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

export function extractVideoId(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (isYouTubeVideoId(raw)) return raw;

  try {
    const url = new URL(raw, 'https://www.youtube.com');
    const v = url.searchParams.get('v');
    if (isYouTubeVideoId(v)) return v;
    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (isYouTubeVideoId(last)) return last;
  } catch {
    // not a URL
  }

  const match = raw.match(/(?:v=|\/vi\/|youtu\.be\/|\/watch\/)([a-zA-Z0-9_-]{11})/);
  return match && isYouTubeVideoId(match[1]) ? match[1] : null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function classNamesForGrid(): string {
  return 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';
}

export function describeCodec(mimeType?: string, fileFormat?: string, bitrate?: number): string {
  const parts: string[] = [];
  if (fileFormat) {
    parts.push(fileFormat.toUpperCase());
  } else if (mimeType) {
    const lower = mimeType.toLowerCase();
    if (lower.includes('flac')) parts.push('FLAC');
    else if (lower.includes('wav')) parts.push('WAV PCM');
    else if (lower.includes('opus')) parts.push('Opus');
    else if (lower.includes('mp4a') || lower.includes('audio/mp4') || lower.includes('m4a')) parts.push('AAC / M4A');
    else if (lower.includes('mpeg') || lower.includes('mp3')) parts.push('MP3');
    else if (lower.includes('webm')) parts.push('WebM Audio');
    else if (lower.includes('ogg')) parts.push('OGG Vorbis');
    else parts.push(mimeType.split(';')[0]);
  }
  if (bitrate && Number.isFinite(bitrate) && bitrate > 0) {
    const kbps = bitrate > 1000 ? Math.round(bitrate / 1000) : Math.round(bitrate);
    if (kbps > 0) parts.push(`${kbps} kbps`);
  }
  return parts.join(' · ') || 'Live Audio Stream';
}
