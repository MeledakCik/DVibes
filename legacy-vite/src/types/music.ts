export type MusicSource = 'audius' | 'local' | 'jamendo';

export type NavTab =
  | 'home'
  | 'search'
  | 'lyrics'
  | 'library'
  | 'favorites'
  | 'recent'
  | 'support';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork: string;
  duration: number; // in seconds
  streamUrl: string;
  source: MusicSource;
  genre?: string;
  moodTag?: string;
  playCount?: number;
  addedAt?: string;
  isLocalFile?: boolean;
  lyrics?: LyricLine[];
}

export interface LyricLine {
  time: number; // seconds
  timestamp: string;
  text: string;
  subtext: string;
}

export interface AmbientStem {
  id: string;
  name: string;
  subtitle: string;
  type: 'rain' | 'vinyl' | 'drone432' | 'wind' | 'fireplace';
  volume: number; // 0 to 100
  active: boolean;
  accentColor: 'lavender' | 'sage' | 'dusty-blue';
}

export interface PastSessionMix {
  id: string;
  title: string;
  loggedAgo: string;
  durationLabel: string;
  trackCount: number;
  artwork: string;
  stems: { name: string; level: number; color: string }[];
  tracks: Track[];
}
