export type TrackSource = 'piped' | 'invidious' | 'innertube' | 'audius' | 'itunes' | 'local';

export interface Track {
  /** Unique track id (11-char YouTube video id, `audius-*`, `itunes-*`, or `local-*`). */
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  /** Seconds. 0 means the upstream did not provide a duration. */
  duration: number;
  source: TrackSource;
  album?: string;
  views?: number;
  uploadedAt?: string;
  /** Direct stream URL when already known (e.g. Audius, iTunes preview, or local file). */
  directStreamUrl?: string;
  /** Real file/codec format when known (e.g. FLAC, WAV, MP3, M4A, OGG, AAC, OPUS). */
  fileFormat?: string;
  /** Real audio bitrate in bps when known. */
  bitrate?: number;
  /** Real audio sample rate in Hz when known (e.g. 44100, 48000). */
  sampleRate?: number;
  /** True for user-imported local files. */
  isLocalFile?: boolean;
}

export type StreamProvider = TrackSource;

export interface StreamCandidate {
  url: string;
  provider: StreamProvider;
  mimeType?: string;
  bitrate?: number;
  userAgent?: string;
}

export interface ResolvedStream {
  videoId: string;
  audioUrl: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  provider: StreamProvider;
  /** Epoch milliseconds. Audio URLs from YouTube are short lived. */
  expiresAt: number;
  mimeType?: string;
  bitrate?: number;
  userAgent?: string;
  /** Ordered list of candidate stream URLs (including backups from other providers/clients). */
  candidates?: StreamCandidate[];
}

export interface SearchPayload {
  tracks: Track[];
  provider: TrackSource;
  query: string;
  instance?: string;
  fetchedAt: number;
  /** True when the payload came from the on-device cache instead of the network. */
  fromCache?: boolean;
}

export interface StreamPayload extends ResolvedStream {
  cached?: boolean;
}

export interface LyricLine {
  /** Seconds from the start of the track. */
  time: number;
  text: string;
}

export type LyricsSource = 'lrclib' | 'lyrics.ovh' | 'local';

export interface LyricsPayload {
  videoId: string;
  /** True only when real LRC timestamps were found. */
  synced: boolean;
  lines: LyricLine[];
  /** Plain-text lyrics, used when no timestamped version exists. */
  plain: string | null;
  provider: LyricsSource;
  trackName: string;
  artistName: string;
  albumName?: string;
  /** Seconds reported by the lyrics provider, if any. */
  duration: number | null;
  instrumental: boolean;
  fetchedAt: number;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  attempts?: string[];
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiErrorPayload };

export interface ProviderAttempt {
  provider: TrackSource;
  message: string;
}

export class ProviderError extends Error {
  provider: TrackSource;
  detail?: string;

  constructor(provider: TrackSource, message: string, detail?: string) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.detail = detail;
  }
}
