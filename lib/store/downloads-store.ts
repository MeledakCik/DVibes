'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { resolveStreamClient, fetchLyrics } from '@/lib/api/client';
import { ANDROID_UA } from '@/lib/api/innertube';
import { fileUrl, invokeNative, isNative, listenNative } from '@/lib/native/platform';
import { isOffline } from '@/lib/store/network-store';
import { useOfflineStore } from '@/lib/store/offline-store';
import type { Track } from '@/lib/types';

/**
 * Offline library. Audio + artwork live in the app's private data folder (written
 * by Rust), metadata lives here, lyrics live in the lyrics cache.
 */

export interface DownloadMeta {
  track: Track;
  bytes: number;
  downloadedAt: number;
  mimeType?: string;
}

export interface DownloadFile {
  path: string;
  thumbPath?: string;
}

export type DownloadPhase = 'resolving' | 'downloading' | 'error';

export interface DownloadProgress {
  phase: DownloadPhase;
  received: number;
  total: number;
  error?: string;
}

interface NativeDownloadResult {
  videoId: string;
  path: string;
  thumbPath?: string | null;
  bytes: number;
}

interface NativeListedFile {
  videoId: string;
  path: string;
  thumbPath?: string | null;
  bytes: number;
}

interface DownloadsState {
  meta: Record<string, DownloadMeta>;
  files: Record<string, DownloadFile>;
  progress: Record<string, DownloadProgress>;
  ready: boolean;

  init: () => Promise<void>;
  download: (track: Track) => Promise<void>;
  downloadMany: (tracks: Track[]) => Promise<void>;
  cancel: (videoId: string) => Promise<void>;
  remove: (videoId: string) => Promise<void>;
  removeAll: () => Promise<void>;
}

function extFor(mime?: string, fileFormat?: string): string {
  if (fileFormat) {
    const f = fileFormat.toLowerCase();
    if (['m4a', 'webm', 'mp3', 'ogg', 'flac', 'wav', 'aac', 'opus'].includes(f)) return f;
  }
  if (!mime) return 'm4a';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('webm') || mime.includes('opus')) return 'webm';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('wav')) return 'wav';
  return 'm4a';
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Download failed';
  return message.length > 160 ? `${message.slice(0, 157)}…` : message;
}

let listening = false;

export const useDownloadsStore = create<DownloadsState>()(
  persist(
    (set, get) => {
      const setProgress = (videoId: string, value: DownloadProgress | null) => {
        const next = { ...get().progress };
        if (value) next[videoId] = value;
        else delete next[videoId];
        set({ progress: next });
      };

      const downloadOne = async (track: Track): Promise<void> => {
        const id = track.videoId;
        if (track.isLocalFile || track.source === 'local') {
          return;
        }
        if (
          get().files[id] ||
          get().progress[id]?.phase === 'resolving' ||
          get().progress[id]?.phase === 'downloading'
        ) {
          return;
        }

        if (!isNative()) {
          setProgress(id, {
            phase: 'error',
            received: 0,
            total: 0,
            error: 'Direct YouTube downloads require the native app, or use "Import Local Audio" to add MP3/FLAC/WAV files in the browser.'
          });
          return;
        }

        if (isOffline()) {
          setProgress(id, {
            phase: 'error',
            received: 0,
            total: 0,
            error: 'You are offline. Connect to the internet to download this track.'
          });
          return;
        }

        setProgress(id, { phase: 'resolving', received: 0, total: 0 });

        const attempt = async (force: boolean): Promise<{ result: NativeDownloadResult; mimeType?: string }> => {
          const stream = await resolveStreamClient(id, {
            force,
            title: track.title,
            artist: track.artist,
            directStreamUrl: track.directStreamUrl
          });
          setProgress(id, { phase: 'downloading', received: 0, total: 0 });

          const candidates = stream.candidates?.length
            ? stream.candidates
            : [
                {
                  url: stream.audioUrl,
                  provider: stream.provider,
                  mimeType: stream.mimeType,
                  userAgent: stream.userAgent
                }
              ];

          let lastErr: unknown = null;
          for (const candidate of candidates) {
            try {
              const result = await invokeNative<NativeDownloadResult>('download_track', {
                videoId: id,
                url: candidate.url,
                thumbUrl: track.thumbnail || null,
                userAgent:
                  candidate.userAgent || (candidate.provider === 'innertube' ? ANDROID_UA : null),
                ext: extFor(candidate.mimeType || stream.mimeType, track.fileFormat)
              });
              return { result, mimeType: candidate.mimeType || stream.mimeType };
            } catch (err) {
              if (String(err).includes('cancelled')) throw err;
              lastErr = err;
            }
          }
          throw lastErr ?? new Error('All candidate stream URLs failed to download');
        };

        try {
          let outcome: { result: NativeDownloadResult; mimeType?: string };
          try {
            outcome = await attempt(false);
          } catch (firstError) {
            if (String(firstError).includes('cancelled')) throw firstError;
            outcome = await attempt(true);
          }

          set({
            meta: {
              ...get().meta,
              [id]: {
                track,
                bytes: outcome.result.bytes,
                downloadedAt: Date.now(),
                mimeType: outcome.mimeType
              }
            },
            files: {
              ...get().files,
              [id]: {
                path: outcome.result.path,
                thumbPath: outcome.result.thumbPath ?? undefined
              }
            }
          });
          setProgress(id, null);

          // Make lyrics available offline too (best effort, never blocks the download).
          void fetchLyrics(track).catch(() => undefined);
        } catch (error) {
          if (String(error).includes('cancelled')) {
            setProgress(id, null);
            return;
          }
          setProgress(id, { phase: 'error', received: 0, total: 0, error: friendlyError(error) });
        }
      };

      return {
        meta: {},
        files: {},
        progress: {},
        ready: false,

        init: async () => {
          void useOfflineStore.getState().initVault();

          if (!isNative()) {
            set({ ready: true });
            return;
          }

          if (!listening) {
            listening = true;
            void listenNative<{ videoId: string; received: number; total: number }>(
              'download-progress',
              (event) => {
                const current = get().progress[event.videoId];
                if (!current || current.phase === 'error') return;
                setProgress(event.videoId, {
                  phase: 'downloading',
                  received: event.received,
                  total: event.total
                });
              }
            );
          }

          try {
            const listed = await invokeNative<NativeListedFile[]>('list_downloads');
            const onDisk = new Map(listed.map((file) => [file.videoId, file]));
            const meta = { ...get().meta };
            const files: Record<string, DownloadFile> = {};

            for (const id of Object.keys(meta)) {
              const file = onDisk.get(id);
              if (!file) {
                delete meta[id];
                continue;
              }
              files[id] = { path: file.path, thumbPath: file.thumbPath ?? undefined };
              meta[id] = { ...meta[id], bytes: file.bytes };
            }

            set({ meta, files, ready: true });
          } catch {
            set({ ready: true });
          }
        },

        download: downloadOne,

        downloadMany: async (tracks) => {
          for (const track of tracks) {
            if (isOffline()) break;
            await downloadOne(track);
          }
        },

        cancel: async (videoId) => {
          if (isNative()) {
            await invokeNative('cancel_download', { videoId }).catch(() => undefined);
          }
          setProgress(videoId, null);
        },

        remove: async (videoId) => {
          if (isNative()) {
            await invokeNative('delete_download', { videoId }).catch(() => undefined);
          }
          const meta = { ...get().meta };
          const files = { ...get().files };
          delete meta[videoId];
          delete files[videoId];
          set({ meta, files });
        },

        removeAll: async () => {
          const ids = Object.keys(get().meta);
          for (const id of ids) {
            if (isNative()) await invokeNative('delete_download', { videoId: id }).catch(() => undefined);
          }
          set({ meta: {}, files: {} });
        }
      };
    },
    {
      name: 'dvibes-downloads-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ meta: state.meta })
    }
  )
);

/* -------------------------------------------------------------------------- */
/* Helpers                                                                      */
/* -------------------------------------------------------------------------- */

export function isDownloaded(videoId: string): boolean {
  const state = useDownloadsStore.getState();
  if (state.meta[videoId] && state.files[videoId]) return true;
  const localTracks = useOfflineStore.getState().localTracks;
  return localTracks.some((t) => t.videoId === videoId);
}

export function localAudioUrl(videoId: string): string | null {
  const file = useDownloadsStore.getState().files[videoId];
  return file ? fileUrl(file.path) : null;
}

export function localArtworkUrl(videoId: string): string | null {
  const file = useDownloadsStore.getState().files[videoId];
  return file?.thumbPath ? fileUrl(file.thumbPath) : null;
}

export function downloadedTracks(): Track[] {
  const { meta, files } = useDownloadsStore.getState();
  return Object.values(meta)
    .filter((item) => !!files[item.track.videoId])
    .sort((a, b) => b.downloadedAt - a.downloadedAt)
    .map((item) => item.track);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
