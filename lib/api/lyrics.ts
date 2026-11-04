import type { LyricLine, LyricsPayload, LyricsSource } from '@/lib/types';
import { TtlCache } from './cache';
import { errorMessage, fetchJson, HttpError } from './http';

const LRCLIB_BASE = 'https://lrclib.net/api';
const LYRICS_OVH_BASE = 'https://api.lyrics.ovh/v1';
const SIX_HOURS = 6 * 60 * 60 * 1000;
const MISS_TTL = 5 * 60 * 1000;

interface LrclibRecord {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

export interface LyricsQuery {
  videoId: string;
  title: string;
  artist: string;
  duration?: number;
  refresh?: boolean;
}

export class LyricsNotFoundError extends Error {
  attempts?: string[];

  constructor(message: string, attempts?: string[]) {
    super(message);
    this.name = 'LyricsNotFoundError';
    this.attempts = attempts;
  }
}

const lyricsCache = new TtlCache<LyricsPayload>(SIX_HOURS, 300);
const inFlight = new Map<string, Promise<LyricsPayload>>();
const recentMisses = new Map<string, number>();

/* -------------------------------------------------------------------------- */
/* Metadata cleaning                                                          */
/* -------------------------------------------------------------------------- */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' '
};

const NOISE_SEGMENT =
  /\b(official|officiel|music\s+video|audio|lyrics?|lyric\s+video|visuali[sz]er|hd|hq|4k|8k|mv|m\/v|remaster(?:ed)?|explicit|clean|color\s*coded|sub(?:title)?s?)\b/i;

function decodeEntities(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/gi, (match) => ENTITIES[match.toLowerCase()] ?? match)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function stripBrackets(value: string): string {
  let current = value;
  let next = current.replace(/[([{][^)\]}]*[)\]}]/g, ' ');
  while (next !== current) {
    current = next;
    next = current.replace(/[([{][^)\]}]*[)\]}]/g, ' ');
  }
  return current;
}

function tidy(value: string): string {
  return value
    .replace(/\s*[-–—]\s*(official\s+)?(music\s+)?(video|audio|lyric[s]?\s+video|visuali[sz]er)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—|•]+|[\s\-–—|•]+$/g, '')
    .trim();
}

export function cleanTrackName(raw: string): string {
  let value = decodeEntities(raw || '');
  value = stripBrackets(value).replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, ' ');

  const segments = value
    .split(/\s*[|•]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (segments.length > 1) {
    const kept = segments.filter((part) => !NOISE_SEGMENT.test(part));
    value = kept.length ? kept.join(' - ') : segments[0];
  }

  return tidy(value);
}

export function cleanArtistName(raw: string): string {
  let value = decodeEntities(raw || '');
  value = stripBrackets(value)
    .replace(/\s*[-–—]\s*topic\s*$/i, '')
    .replace(/\s+VEVO\s*$/i, '')
    .replace(/\s+/g, ' ');
  return tidy(value);
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenSet(value: string): Set<string> {
  const stop = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'for', 'with', 'feat', 'ft']);
  return new Set(
    normalizeText(value)
      .split(' ')
      .filter((token) => token && !stop.has(token))
  );
}

function tokenSimilarity(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;

  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  if (!intersection) return 0;

  const containment = intersection / Math.min(left.size, right.size);
  const jaccard = intersection / (left.size + right.size - intersection);
  return Math.max(containment * 0.92, jaccard);
}

export interface TrackMeta {
  title: string;
  artist: string;
}

/**
 * Piped/Invidious titles are messy YouTube titles ("Artist - Song (Official
 * Video)"). LRCLIB expects the actual song/artist pair, so clean both and pull
 * an "Artist - " prefix out of the title when it matches the artist field.
 */
export function deriveTrackMeta(title: string, artist: string): TrackMeta {
  let cleanTitle = cleanTrackName(title);
  let cleanArtist = cleanArtistName(artist);

  const match = cleanTitle.match(/^(.{1,90}?)\s+[-–—]\s+(.+)$/);
  if (match) {
    const left = match[1].trim();
    const right = match[2].trim();
    if (!cleanArtist) {
      if (!NOISE_SEGMENT.test(left)) {
        cleanArtist = cleanArtistName(left);
        cleanTitle = right;
      }
    } else if (
      tokenSimilarity(left, cleanArtist) >= 0.6 ||
      normalizeText(left) === normalizeText(cleanArtist)
    ) {
      cleanTitle = right;
    }
  }

  return {
    title: cleanTitle || title.trim(),
    artist: cleanArtist || artist.trim()
  };
}

/* -------------------------------------------------------------------------- */
/* LRC parsing                                                                */
/* -------------------------------------------------------------------------- */

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const OFFSET_TAG = /\[offset:\s*([+-]?\d+)\s*\]/i;
const METADATA_TAG = /^\[(ar|ti|al|by|length|re|ve|tool|encoding):.*\]$/i;

export function parseLrc(raw: string): LyricLine[] {
  if (!raw) return [];

  const offsetMatch = raw.match(OFFSET_TAG);
  const offsetSeconds = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const lines: LyricLine[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || METADATA_TAG.test(line)) continue;

    const timestamps: number[] = [];
    TIME_TAG.lastIndex = 0;
    let tag: RegExpExecArray | null;
    while ((tag = TIME_TAG.exec(line)) !== null) {
      const minutes = Number(tag[1]);
      const seconds = Number(tag[2]);
      const fraction = tag[3] ? Number(tag[3].padEnd(3, '0')) / 1000 : 0;
      timestamps.push(minutes * 60 + seconds + fraction);
    }
    if (!timestamps.length) continue;

    const text = line
      .replace(TIME_TAG, '')
      .replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) continue;

    for (const stamp of timestamps) {
      const time = Math.max(0, Math.round((stamp + offsetSeconds) * 100) / 100);
      lines.push({ time, text });
    }
  }

  lines.sort((a, b) => a.time - b.time);

  const deduped: LyricLine[] = [];
  for (const line of lines) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.time === line.time && previous.text === line.text) continue;
    deduped.push(line);
  }

  return deduped;
}

export function normalizePlainLyrics(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || null;
}

/* -------------------------------------------------------------------------- */
/* Provider lookup                                                            */
/* -------------------------------------------------------------------------- */

function positive(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function payloadFor(
  query: LyricsQuery,
  meta: TrackMeta,
  record: LrclibRecord,
  provider: LyricsSource
): LyricsPayload | null {
  const instrumental = record.instrumental === true;

  if (!instrumental) {
    const synced = record.syncedLyrics ? parseLrc(record.syncedLyrics) : [];
    if (synced.length) {
      return {
        videoId: query.videoId,
        synced: true,
        lines: synced,
        plain: normalizePlainLyrics(record.plainLyrics),
        provider,
        trackName: record.trackName || meta.title,
        artistName: record.artistName || meta.artist,
        albumName: record.albumName || undefined,
        duration: positive(record.duration) || null,
        instrumental: false,
        fetchedAt: Date.now()
      };
    }

    const plain = normalizePlainLyrics(record.plainLyrics);
    if (plain) {
      return {
        videoId: query.videoId,
        synced: false,
        lines: [],
        plain,
        provider,
        trackName: record.trackName || meta.title,
        artistName: record.artistName || meta.artist,
        albumName: record.albumName || undefined,
        duration: positive(record.duration) || null,
        instrumental: false,
        fetchedAt: Date.now()
      };
    }
  }

  if (instrumental) {
    return {
      videoId: query.videoId,
      synced: false,
      lines: [],
      plain: null,
      provider,
      trackName: record.trackName || meta.title,
      artistName: record.artistName || meta.artist,
      albumName: record.albumName || undefined,
      duration: positive(record.duration) || null,
      instrumental: true,
      fetchedAt: Date.now()
    };
  }

  return null;
}

function scoreCandidate(record: LrclibRecord, meta: TrackMeta, duration: number): number {
  const titleScore = tokenSimilarity(record.trackName || '', meta.title);
  const artistScore = meta.artist
    ? tokenSimilarity(record.artistName || '', meta.artist)
    : 0.6;

  const candidateDuration = positive(record.duration);
  const durationScore =
    duration > 0 && candidateDuration > 0
      ? 1 - Math.min(Math.abs(candidateDuration - duration) / 30, 1)
      : 0.3;

  const textBonus = record.syncedLyrics ? 0.06 : record.plainLyrics ? 0.02 : 0;
  return titleScore * 0.58 + artistScore * 0.3 + durationScore * 0.12 + textBonus;
}

function isPlausible(record: LrclibRecord, meta: TrackMeta, duration: number): boolean {
  const titleScore = tokenSimilarity(record.trackName || '', meta.title);
  if (titleScore < 0.55) return false;

  if (meta.artist) {
    const artistScore = tokenSimilarity(record.artistName || '', meta.artist);
    if (artistScore < 0.35) return false;
  }

  const candidateDuration = positive(record.duration);
  if (duration > 0 && candidateDuration > 0 && Math.abs(candidateDuration - duration) > 25) {
    return false;
  }

  return true;
}

async function lookupLyrics(query: LyricsQuery): Promise<LyricsPayload> {
  const meta = deriveTrackMeta(query.title, query.artist);
  const duration = positive(query.duration);
  const attempts: string[] = [];
  let availabilityAnswered = false;

  // 1. LRCLIB exact match. A 404 here simply means "no exact record", so we
  // continue to search instead of treating it as a provider failure.
  if (meta.artist && meta.title) {
    try {
      const params = new URLSearchParams({
        artist_name: meta.artist,
        track_name: meta.title
      });
      if (duration) params.set('duration', String(Math.round(duration)));

      const record = await fetchJson<LrclibRecord>(`${LRCLIB_BASE}/get?${params.toString()}`, {
        timeoutMs: 8000
      });
      const payload = payloadFor(query, meta, record, 'lrclib');
      if (payload) return payload;
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 404)) {
        attempts.push(`lrclib/get: ${errorMessage(error)}`);
      }
    }
  }

  // 2. LRCLIB full-text search with best-match scoring.
  if (meta.title) {
    try {
      const searchQuery = [meta.title, meta.artist].filter(Boolean).join(' ');
      const results = await fetchJson<LrclibRecord[]>(
        `${LRCLIB_BASE}/search?q=${encodeURIComponent(searchQuery)}`,
        { timeoutMs: 8000 }
      );
      availabilityAnswered = true;

      if (Array.isArray(results)) {
        const best = results
          .filter((record) => record && typeof record === 'object')
          .filter((record) => isPlausible(record, meta, duration))
          .sort((a, b) => scoreCandidate(b, meta, duration) - scoreCandidate(a, meta, duration))[0];

        if (best) {
          const payload = payloadFor(query, meta, best, 'lrclib');
          if (payload) return payload;
        }
      }
    } catch (error) {
      attempts.push(`lrclib/search: ${errorMessage(error)}`);
    }
  }

  // 3. Plain-text fallback. This never invents timestamps; the UI renders it as
  // a readable lyric sheet with sync controls disabled.
  if (meta.artist && meta.title) {
    try {
      const response = await fetchJson<{ lyrics?: string }>(
        `${LYRICS_OVH_BASE}/${encodeURIComponent(meta.artist)}/${encodeURIComponent(meta.title)}`,
        { timeoutMs: 8000 }
      );
      availabilityAnswered = true;
      const plain = normalizePlainLyrics(response.lyrics);
      if (plain) {
        return {
          videoId: query.videoId,
          synced: false,
          lines: [],
          plain,
          provider: 'lyrics.ovh',
          trackName: meta.title,
          artistName: meta.artist,
          duration: duration || null,
          instrumental: false,
          fetchedAt: Date.now()
        };
      }
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        availabilityAnswered = true;
      } else {
        attempts.push(`lyrics.ovh: ${errorMessage(error)}`);
      }
    }
  }

  if (!availabilityAnswered && attempts.length) {
    const error = new Error('No lyrics provider could be reached') as Error & { attempts?: string[] };
    error.attempts = attempts;
    throw error;
  }

  throw new LyricsNotFoundError(
    'No lyrics were found for this track. Try another version or retry in a moment.',
    attempts
  );
}

/**
 * Fetch lyrics for a real track, with a six-hour positive cache, a short
 * negative cache, and in-flight request deduplication. Nothing is fabricated:
 * an empty result becomes a typed not-found error for the UI.
 */
export async function getLyrics(query: LyricsQuery): Promise<LyricsPayload> {
  const key = query.videoId;

  if (!query.refresh) {
    const cached = lyricsCache.get(key);
    if (cached) return cached;

    const missedAt = recentMisses.get(key);
    if (missedAt && Date.now() - missedAt < MISS_TTL) {
      throw new LyricsNotFoundError('No lyrics were found for this track on the last attempt.');
    }

    const pending = inFlight.get(key);
    if (pending) return pending;
  }

  const promise = lookupLyrics(query)
    .then((payload) => {
      lyricsCache.set(key, payload);
      recentMisses.delete(key);
      return payload;
    })
    .catch((error) => {
      if (error instanceof LyricsNotFoundError) recentMisses.set(key, Date.now());
      throw error;
    })
    .finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}
