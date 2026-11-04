'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ANDROID_UA } from '@/lib/api/innertube';
import { normalizePlainLyrics, parseLrc } from '@/lib/api/lyrics';
import { fileUrl, invokeNative, isNative, listenNative } from '@/lib/native/platform';
import { storeLyrics } from '@/lib/offline/lyrics-cache';
import { isOffline } from '@/lib/store/network-store';
import type { LyricsPayload, Track } from '@/lib/types';

/**
 * Unified Offline Downloads + Local Audio/LRC Vault (`lib/store/downloads-store.ts`).
 *
 * Keeping both `useDownloadsStore` and `useOfflineStore` in this tracked module
 * ensures zero missing-module errors even when git commits only tracked files.
 */

/* -------------------------------------------------------------------------- */
/* IndexedDB + Tauri FS Local Audio Vault & ID3v2 Metadata Parser              */
/* -------------------------------------------------------------------------- */

const DB_NAME = 'dvibes-offline-vault-v1';
const STORE_AUDIO = 'audio_blobs';
const DB_VERSION = 1;

interface StoredAudioRecord {
  videoId: string;
  blob: Blob;
  mimeType: string;
  ext: string;
  nativePath?: string;
  savedAt: number;
}

const activeObjectUrls = new Map<string, string>();
const nativeFilePaths = new Map<string, string>();

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: 'videoId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function saveAudioToVault(
  videoId: string,
  file: File | Blob,
  ext: string
): Promise<{ url: string; nativePath?: string; bytes: number }> {
  const bytes = file.size;
  let nativePath: string | undefined;

  if (isNative()) {
    try {
      const buffer = await file.arrayBuffer();
      const uint8 = Array.from(new Uint8Array(buffer));
      const res = await invokeNative<{ videoId: string; path: string; bytes: number }>(
        'save_imported_audio',
        {
          videoId,
          bytes: uint8,
          ext
        }
      );
      if (res?.path) {
        nativePath = res.path;
        nativeFilePaths.set(videoId, res.path);
      }
    } catch {
      // Fall back to IndexedDB blob
    }
  }

  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO, 'readwrite');
      const store = tx.objectStore(STORE_AUDIO);
      const record: StoredAudioRecord = {
        videoId,
        blob: file,
        mimeType: file.type || `audio/${ext}`,
        ext,
        nativePath,
        savedAt: Date.now()
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore quota errors
  }

  if (nativePath) {
    const assetUrl = fileUrl(nativePath);
    activeObjectUrls.set(videoId, assetUrl);
    return { url: assetUrl, nativePath, bytes };
  }

  const prev = activeObjectUrls.get(videoId);
  if (prev && prev.startsWith('blob:')) {
    URL.revokeObjectURL(prev);
  }
  const blobUrl = URL.createObjectURL(file);
  activeObjectUrls.set(videoId, blobUrl);
  return { url: blobUrl, bytes };
}

export async function getVaultAudioUrl(videoId: string): Promise<string | null> {
  const existing = activeObjectUrls.get(videoId);
  if (existing) return existing;

  const knownNative = nativeFilePaths.get(videoId);
  if (knownNative && isNative()) {
    const url = fileUrl(knownNative);
    activeObjectUrls.set(videoId, url);
    return url;
  }

  try {
    const db = await openVaultDb();
    const record = await new Promise<StoredAudioRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO, 'readonly');
      const store = tx.objectStore(STORE_AUDIO);
      const req = store.get(videoId);
      req.onsuccess = () => resolve(req.result as StoredAudioRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();

    if (!record) return null;
    if (record.nativePath && isNative()) {
      nativeFilePaths.set(videoId, record.nativePath);
      const url = fileUrl(record.nativePath);
      activeObjectUrls.set(videoId, url);
      return url;
    }
    if (record.blob) {
      const blobUrl = URL.createObjectURL(record.blob);
      activeObjectUrls.set(videoId, blobUrl);
      return blobUrl;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function preloadVaultUrls(videoIds: string[]): Promise<void> {
  for (const id of videoIds) {
    if (!activeObjectUrls.has(id)) {
      await getVaultAudioUrl(id);
    }
  }
}

export async function removeAudioFromVault(videoId: string): Promise<void> {
  const prev = activeObjectUrls.get(videoId);
  if (prev && prev.startsWith('blob:')) {
    URL.revokeObjectURL(prev);
  }
  activeObjectUrls.delete(videoId);
  nativeFilePaths.delete(videoId);

  if (isNative()) {
    await invokeNative('delete_download', { videoId }).catch(() => undefined);
  }

  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_AUDIO, 'readwrite');
      tx.objectStore(STORE_AUDIO).delete(videoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // ignore
  }
}

export interface ExtractedAudioMeta {
  title: string;
  artist: string;
  album?: string;
  duration: number;
  fileFormat: string;
  bitrate?: number;
  thumbnail?: string;
}

function decodeId3Text(bytes: Uint8Array): string {
  if (!bytes.length) return '';
  const encoding = bytes[0];
  const payload = bytes.subarray(1);
  try {
    if (encoding === 0) {
      return new TextDecoder('iso-8859-1').decode(payload).replace(/\0/g, '').trim();
    }
    if (encoding === 1 || encoding === 2) {
      return new TextDecoder('utf-16').decode(payload).replace(/\0/g, '').trim();
    }
    return new TextDecoder('utf-8').decode(payload).replace(/\0/g, '').trim();
  } catch {
    return '';
  }
}

async function parseId3v2(
  file: File
): Promise<{ title?: string; artist?: string; album?: string; coverDataUrl?: string }> {
  try {
    const slice = file.slice(0, Math.min(file.size, 256 * 1024));
    const buf = await slice.arrayBuffer();
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);

    if (
      bytes.length < 10 ||
      bytes[0] !== 0x49 ||
      bytes[1] !== 0x44 ||
      bytes[2] !== 0x33
    ) {
      return {};
    }

    const version = bytes[3];
    const tagSize =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);

    const limit = Math.min(bytes.length, 10 + tagSize);
    let offset = 10;
    const out: { title?: string; artist?: string; album?: string; coverDataUrl?: string } = {};

    while (offset + 10 <= limit) {
      const frameId = String.fromCharCode(
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3]
      );
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

      const frameSize =
        version === 4
          ? ((bytes[offset + 4] & 0x7f) << 21) |
            ((bytes[offset + 5] & 0x7f) << 14) |
            ((bytes[offset + 6] & 0x7f) << 7) |
            (bytes[offset + 7] & 0x7f)
          : view.getUint32(offset + 4, false);

      if (frameSize <= 0 || offset + 10 + frameSize > limit) break;
      const content = bytes.subarray(offset + 10, offset + 10 + frameSize);

      if (frameId === 'TIT2') out.title = decodeId3Text(content) || out.title;
      else if (frameId === 'TPE1') out.artist = decodeId3Text(content) || out.artist;
      else if (frameId === 'TALB') out.album = decodeId3Text(content) || out.album;
      else if (frameId === 'APIC' && !out.coverDataUrl && frameSize < 180 * 1024) {
        let p = 1;
        while (p < content.length && content[p] !== 0) p++;
        const mime = new TextDecoder('ascii').decode(content.subarray(1, p)) || 'image/jpeg';
        p += 2;
        while (p < content.length && content[p] !== 0) p++;
        p += 1;
        if (p < content.length) {
          const imgBytes = content.subarray(p);
          let binary = '';
          for (let i = 0; i < imgBytes.length; i++) {
            binary += String.fromCharCode(imgBytes[i]);
          }
          out.coverDataUrl = `data:${mime};base64,${btoa(binary)}`;
        }
      }

      offset += 10 + frameSize;
    }

    return out;
  } catch {
    return {};
  }
}

function probeDurationWithAudioElement(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(0);
      return;
    }
    const url = URL.createObjectURL(file);
    const tempAudio = document.createElement('audio');
    tempAudio.preload = 'metadata';

    const cleanup = (dur: number) => {
      tempAudio.removeAttribute('src');
      tempAudio.load();
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 0);
    };

    const timer = setTimeout(() => cleanup(0), 4000);
    tempAudio.onloadedmetadata = () => {
      clearTimeout(timer);
      cleanup(tempAudio.duration);
    };
    tempAudio.onerror = () => {
      clearTimeout(timer);
      cleanup(0);
    };
    tempAudio.src = url;
  });
}

export async function extractLocalAudioMetadata(file: File): Promise<ExtractedAudioMeta> {
  const rawName = file.name.replace(/\.[^/.]+$/, '').trim();
  const ext = (file.name.split('.').pop() || 'mp3').toUpperCase();

  let fallbackArtist = 'Local Library';
  let fallbackTitle = rawName || 'Untitled Audio';
  const splitMatch = rawName.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (splitMatch) {
    fallbackArtist = splitMatch[1].trim();
    fallbackTitle = splitMatch[2].trim();
  }

  const [id3, duration] = await Promise.all([
    parseId3v2(file),
    probeDurationWithAudioElement(file)
  ]);

  const bitrate = duration > 0 ? Math.round((file.size * 8) / duration) : undefined;

  return {
    title: id3.title || fallbackTitle,
    artist: id3.artist || fallbackArtist,
    album: id3.album || `Local ${ext}`,
    duration,
    fileFormat: ext,
    bitrate,
    thumbnail: id3.coverDataUrl
  };
}

/* -------------------------------------------------------------------------- */
/* Local Audio & LRC Store (`useOfflineStore`)                                 */
/* -------------------------------------------------------------------------- */

export interface ImportSummary {
  audioImported: number;
  lyricsImported: number;
  firstTrack?: Track;
  message: string;
}

export interface OfflineStoreState {
  localTracks: Track[];
  localBytes: Record<string, number>;
  customLyrics: Record<string, LyricsPayload>;
  importing: boolean;
  lastImportMessage: string | null;

  initVault: () => Promise<void>;
  importFiles: (
    fileList: FileList | File[],
    targetTrackForLyrics?: Pick<Track, 'videoId' | 'title' | 'artist' | 'duration'> | null
  ) => Promise<ImportSummary>;
  saveCustomLyricsText: (
    track: Pick<Track, 'videoId' | 'title' | 'artist' | 'duration'>,
    rawText: string
  ) => LyricsPayload | null;
  removeCustomLyrics: (videoId: string) => void;
  removeLocalTrack: (videoId: string) => Promise<void>;
  clearLocalTracks: () => Promise<void>;
  resolveLocalPlayableUrl: (videoId: string) => Promise<string | null>;
}

const AUDIO_FILE_RE = /\.(mp3|flac|wav|m4a|ogg|aac|opus|webm)$/i;
const LYRIC_FILE_RE = /\.(lrc|txt)$/i;

function stemOf(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hashStem(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function buildLyricsPayload(
  track: Pick<Track, 'videoId' | 'title' | 'artist' | 'duration'>,
  rawText: string
): LyricsPayload | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const syncedLines = parseLrc(trimmed);
  const plain =
    syncedLines.length > 0
      ? syncedLines.map((l) => l.text).join('\n')
      : normalizePlainLyrics(trimmed);

  if (!syncedLines.length && !plain) return null;

  const payload: LyricsPayload = {
    videoId: track.videoId,
    synced: syncedLines.length > 0,
    lines: syncedLines,
    plain,
    provider: 'local',
    trackName: track.title,
    artistName: track.artist,
    duration: track.duration > 0 ? track.duration : null,
    instrumental: false,
    fetchedAt: Date.now()
  };

  storeLyrics(payload);
  return payload;
}

export const useOfflineStore = create<OfflineStoreState>()(
  persist(
    (set, get) => ({
      localTracks: [],
      localBytes: {},
      customLyrics: {},
      importing: false,
      lastImportMessage: null,

      initVault: async () => {
        const ids = get().localTracks.map((t: Track) => t.videoId);
        if (ids.length) {
          await preloadVaultUrls(ids);
        }
      },

      importFiles: async (fileList, targetTrackForLyrics = null) => {
        const files = Array.from(fileList);
        if (!files.length) {
          return { audioImported: 0, lyricsImported: 0, message: 'No files selected.' };
        }

        set({ importing: true, lastImportMessage: null });

        const audioFiles = files.filter(
          (f) => AUDIO_FILE_RE.test(f.name) || f.type.startsWith('audio/')
        );
        const lyricFiles = files.filter((f) => LYRIC_FILE_RE.test(f.name));

        const newlyImportedTracks: Track[] = [];
        const nextBytes = { ...get().localBytes };
        const stemToTrack = new Map<string, Track>();

        for (const existing of get().localTracks) {
          stemToTrack.set(stemOf(existing.title), existing);
          stemToTrack.set(stemOf(`${existing.artist} ${existing.title}`), existing);
        }

        for (let i = 0; i < audioFiles.length; i++) {
          const file = audioFiles[i];
          const ext = (file.name.split('.').pop() || 'mp3').toLowerCase();
          const videoId = `local-${hashStem(`${file.name}-${file.size}`)}`;
          const meta = await extractLocalAudioMetadata(file);
          const saved = await saveAudioToVault(videoId, file, ext);

          const track: Track = {
            videoId,
            title: meta.title,
            artist: meta.artist,
            album: meta.album,
            thumbnail: meta.thumbnail || '',
            duration: meta.duration,
            source: 'local',
            directStreamUrl: saved.url,
            fileFormat: meta.fileFormat,
            bitrate: meta.bitrate,
            isLocalFile: true
          };

          newlyImportedTracks.push(track);
          nextBytes[videoId] = saved.bytes;
          stemToTrack.set(stemOf(file.name), track);
          stemToTrack.set(stemOf(track.title), track);
        }

        const nextCustomLyrics = { ...get().customLyrics };
        let lyricsImported = 0;

        for (const lrcFile of lyricFiles) {
          try {
            const rawText = await lrcFile.text();
            const lrcStem = stemOf(lrcFile.name);
            const matchedTrack =
              stemToTrack.get(lrcStem) ||
              newlyImportedTracks[0] ||
              targetTrackForLyrics ||
              get().localTracks[0];

            if (matchedTrack) {
              const payload = buildLyricsPayload(matchedTrack, rawText);
              if (payload) {
                nextCustomLyrics[matchedTrack.videoId] = payload;
                lyricsImported += 1;
              }
            }
          } catch {
            // skip unreadable file
          }
        }

        const mergedTracks = [
          ...newlyImportedTracks,
          ...get().localTracks.filter(
            (t: Track) => !newlyImportedTracks.some((n: Track) => n.videoId === t.videoId)
          )
        ];

        const parts: string[] = [];
        if (newlyImportedTracks.length) {
          parts.push(
            `${newlyImportedTracks.length} audio file${newlyImportedTracks.length === 1 ? '' : 's'}`
          );
        }
        if (lyricsImported) {
          parts.push(`${lyricsImported} LRC lyric file${lyricsImported === 1 ? '' : 's'}`);
        }
        const message = parts.length
          ? `Imported ${parts.join(' and ')}.`
          : 'No supported audio (.mp3, .flac, .wav, .m4a, .ogg) or .lrc files found.';

        set({
          localTracks: mergedTracks,
          localBytes: nextBytes,
          customLyrics: nextCustomLyrics,
          importing: false,
          lastImportMessage: message
        });

        return {
          audioImported: newlyImportedTracks.length,
          lyricsImported,
          firstTrack: newlyImportedTracks[0],
          message
        };
      },

      saveCustomLyricsText: (track, rawText) => {
        const payload = buildLyricsPayload(track, rawText);
        if (!payload) return null;
        set({
          customLyrics: {
            ...get().customLyrics,
            [track.videoId]: payload
          }
        });
        return payload;
      },

      removeCustomLyrics: (videoId) => {
        const next = { ...get().customLyrics };
        delete next[videoId];
        set({ customLyrics: next });
      },

      removeLocalTrack: async (videoId) => {
        await removeAudioFromVault(videoId);
        const nextBytes = { ...get().localBytes };
        const nextLyrics = { ...get().customLyrics };
        delete nextBytes[videoId];
        delete nextLyrics[videoId];
        set({
          localTracks: get().localTracks.filter((t: Track) => t.videoId !== videoId),
          localBytes: nextBytes,
          customLyrics: nextLyrics
        });
      },

      clearLocalTracks: async () => {
        const ids = get().localTracks.map((t: Track) => t.videoId);
        for (const id of ids) {
          await removeAudioFromVault(id);
        }
        set({ localTracks: [], localBytes: {} });
      },

      resolveLocalPlayableUrl: async (videoId) => {
        const url = await getVaultAudioUrl(videoId);
        if (url) return url;
        const found = get().localTracks.find((t: Track) => t.videoId === videoId);
        return found?.directStreamUrl ?? null;
      }
    }),
    {
      name: 'dvibes-offline-vault-meta-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        localTracks: state.localTracks.map((t: Track) => ({
          ...t,
          directStreamUrl: t.directStreamUrl?.startsWith('blob:') ? undefined : t.directStreamUrl
        })),
        localBytes: state.localBytes,
        customLyrics: state.customLyrics
      })
    }
  )
);

/* -------------------------------------------------------------------------- */
/* Native Downloads Store (`useDownloadsStore`)                                */
/* -------------------------------------------------------------------------- */

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

export interface DownloadsState {
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
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Download failed';
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
            error:
              'Direct YouTube downloads require the native app, or use "Import Local Audio" to add MP3/FLAC/WAV files in the browser.'
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

        const clientMod = await import('@/lib/api/client');

        const attempt = async (
          force: boolean
        ): Promise<{ result: NativeDownloadResult; mimeType?: string }> => {
          const stream = await clientMod.resolveStreamClient(id, {
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

          void clientMod.fetchLyrics(track).catch(() => undefined);
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
  return localTracks.some((t: Track) => t.videoId === videoId);
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
