import { invoke } from '@tauri-apps/api/tauri';
import { Track } from '../types/music';

/**
 * ============================================================================
 * AUDIUS TAURI RUST IPC CLIENT (CORS-FREE — NO FRONTEND FETCH)
 * ============================================================================
 * All Audius requests are proxied through Tauri Rust commands in
 * `src-tauri/src/main.rs`:
 * - `get_audio_stream_url(id)`: Proxies
 *   `https://discoveryprovider.audius.co/v1/tracks/{id}/stream?app_name=DVIBES`
 *   in Rust and returns a playable URL (`data:audio/mpeg;base64,...`).
 * - `search_audius_tracks(query)`: Proxies `/v1/tracks/search?query=...&app_name=DVIBES`
 * - `get_trending_audius_tracks()`: Proxies `/v1/tracks/trending?app_name=DVIBES`
 */

export async function getAudioStreamUrl(id: string): Promise<string> {
  return await invoke<string>('get_audio_stream_url', { id });
}

function mapAudiusTrack(item: any): Track {
  const trackId = String(item.id || Math.random());
  const artwork =
    item.artwork?.['480x480'] ||
    item.artwork?.['150x150'] ||
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80';

  return {
    id: trackId,
    title: item.title || 'Untitled Midnight Track',
    artist: item.user?.name || item.user?.handle || 'Audius Artist',
    album: item.mood || item.genre || 'Audius Sanctuary',
    duration: Number(item.duration) || 210,
    artwork,
    // Resolved at playback time via `getAudioStreamUrl(trackId)` in `useAudio`
    streamUrl: `tauri://audius-stream/${encodeURIComponent(trackId)}`,
    source: 'audius',
    genre: item.genre || 'Lo-Fi / Electronic',
    moodTag: item.mood || 'Lofi Beats',
    playCount: Number(item.play_count) || 12400,
    addedAt: 'Audius Rust Proxy',
  };
}

export async function searchAudiusTracks(query: string = 'lofi'): Promise<Track[]> {
  const items = await invoke<any[]>('search_audius_tracks', { query: query.trim() || 'lofi' });
  return (items || []).slice(0, 18).map(mapAudiusTrack);
}

export async function fetchTrendingAudiusTracks(): Promise<Track[]> {
  const items = await invoke<any[]>('get_trending_audius_tracks');
  return (items || []).slice(0, 18).map(mapAudiusTrack);
}
