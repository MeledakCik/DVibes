'use client';

import { create } from 'zustand';
import { useLibraryStore } from './library-store';
import { restartAudio, seekAudio } from '@/lib/audio-element';
import { isDownloaded } from '@/lib/store/downloads-store';
import { isOffline } from '@/lib/store/network-store';
import type { ResolvedStream, Track } from '@/lib/types';

export type PlaybackStatus = 'idle' | 'resolving' | 'ready' | 'error';
export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  status: PlaybackStatus;
  error: string | null;
  streamUrl: string | null;
  resolvedVia: string | null;
  mimeType: string | null;
  bitrate: number | null;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  queueOpen: boolean;
  fullscreenOpen: boolean;
  playRequestId: number;
  retryNonce: number;

  playTrack: (track: Track, queue?: Track[]) => void;
  playQueue: (queue: Track[], startIndex?: number) => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  handleEnded: () => void;
  jumpTo: (index: number) => void;
  addToQueue: (track: Track, playNext?: boolean) => void;
  removeFromQueue: (videoId: string) => void;
  clearQueue: () => void;

  setStatus: (status: PlaybackStatus) => void;
  setError: (error: string | null) => void;
  setStream: (stream: ResolvedStream) => void;
  setProgress: (currentTime: number, duration?: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setRepeat: (repeat: RepeatMode) => void;
  toggleShuffle: () => void;
  setQueueOpen: (open: boolean) => void;
  setFullscreenOpen: (open: boolean) => void;
  retry: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  status: 'idle',
  error: null,
  streamUrl: null,
  resolvedVia: null,
  mimeType: null,
  bitrate: null,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  repeat: 'off',
  shuffle: false,
  queueOpen: false,
  fullscreenOpen: false,
  playRequestId: 0,
  retryNonce: 0,

  playTrack: (track, nextQueue) => {
    const currentQueue = get().queue;
    const queue =
      nextQueue && nextQueue.length
        ? [...nextQueue]
        : currentQueue.length
          ? [...currentQueue]
          : [track];

    let index = queue.findIndex((item) => item.videoId === track.videoId);
    if (index === -1) {
      queue.unshift(track);
      index = 0;
    } else {
      queue[index] = track;
    }

    useLibraryStore.getState().addRecent(track);

    set({
      queue,
      currentIndex: index,
      isPlaying: true,
      status: 'resolving',
      error: null,
      streamUrl: null,
      resolvedVia: null,
      mimeType: track.fileFormat ?? null,
      bitrate: track.bitrate ?? null,
      currentTime: 0,
      duration: track.duration || 0,
      playRequestId: get().playRequestId + 1
    });
  },

  playQueue: (queue, startIndex = 0) => {
    if (!queue.length) return;
    const index = Math.min(Math.max(startIndex, 0), queue.length - 1);
    const track = queue[index];
    useLibraryStore.getState().addRecent(track);
    set({
      queue: [...queue],
      currentIndex: index,
      isPlaying: true,
      status: 'resolving',
      error: null,
      streamUrl: null,
      resolvedVia: null,
      mimeType: track.fileFormat ?? null,
      bitrate: track.bitrate ?? null,
      currentTime: 0,
      duration: track.duration || 0,
      playRequestId: get().playRequestId + 1
    });
  },

  togglePlay: () => {
    const { currentIndex, queue, status } = get();
    if (currentIndex < 0 || !queue[currentIndex]) return;

    if (status === 'error') {
      set({
        isPlaying: true,
        status: 'resolving',
        error: null,
        retryNonce: get().retryNonce + 1
      });
      return;
    }

    set({ isPlaying: !get().isPlaying });
  },

  next: () => {
    const { queue, currentIndex, shuffle, repeat } = get();
    if (!queue.length) return;

    const offline = isOffline();
    const canPlayOffline = (t: Track) =>
      isDownloaded(t.videoId) || !!t.isLocalFile || t.source === 'local';

    const candidates = queue
      .map((_, i) => i)
      .filter((i) => i !== currentIndex && (!offline || canPlayOffline(queue[i])));

    let index: number;
    if (offline && !candidates.length) {
      set({ isPlaying: false });
      return;
    }

    if (shuffle && queue.length > 1) {
      const pool = offline ? candidates : queue.map((_, i) => i).filter((i) => i !== currentIndex);
      index = pool[Math.floor(Math.random() * pool.length)];
    } else {
      index = (currentIndex + 1) % queue.length;
      if (offline) {
        let guard = 0;
        while (!canPlayOffline(queue[index]) && guard < queue.length) {
          index = (index + 1) % queue.length;
          guard += 1;
        }
      }
    }

    if (repeat === 'off' && !shuffle && currentIndex === queue.length - 1 && !offline) {
      index = 0;
    }

    const track = queue[index];
    useLibraryStore.getState().addRecent(track);
    set({
      currentIndex: index,
      isPlaying: true,
      status: 'resolving',
      error: null,
      streamUrl: null,
      resolvedVia: null,
      mimeType: track.fileFormat ?? null,
      bitrate: track.bitrate ?? null,
      currentTime: 0,
      duration: track.duration || 0,
      playRequestId: get().playRequestId + 1
    });
  },

  previous: () => {
    const { queue, currentIndex, currentTime } = get();
    if (!queue.length) return;

    if (currentTime > 4) {
      seekAudio(0);
      set({ currentTime: 0 });
      return;
    }

    const canPlayOffline = (t: Track) =>
      isDownloaded(t.videoId) || !!t.isLocalFile || t.source === 'local';

    let index = (currentIndex - 1 + queue.length) % queue.length;
    if (isOffline()) {
      let guard = 0;
      while (!canPlayOffline(queue[index]) && guard < queue.length) {
        index = (index - 1 + queue.length) % queue.length;
        guard += 1;
      }
    }
    const track = queue[index];
    useLibraryStore.getState().addRecent(track);
    set({
      currentIndex: index,
      isPlaying: true,
      status: 'resolving',
      error: null,
      streamUrl: null,
      resolvedVia: null,
      mimeType: track.fileFormat ?? null,
      bitrate: track.bitrate ?? null,
      currentTime: 0,
      duration: track.duration || 0,
      playRequestId: get().playRequestId + 1
    });
  },

  handleEnded: () => {
    const { repeat, shuffle, queue, currentIndex } = get();
    if (repeat === 'one') {
      restartAudio();
      set({ currentTime: 0, isPlaying: true });
      return;
    }

    if (shuffle && queue.length > 1) {
      get().next();
      return;
    }

    if (currentIndex < queue.length - 1) {
      get().next();
      return;
    }

    if (repeat === 'all' && queue.length) {
      get().playQueue(queue, 0);
      return;
    }

    set({ isPlaying: false, currentTime: get().duration });
  },

  jumpTo: (index) => {
    const { queue } = get();
    if (index < 0 || index >= queue.length) return;
    get().playQueue(queue, index);
  },

  addToQueue: (track, playNext = false) => {
    const { queue, currentIndex } = get();
    if (!queue.length) {
      get().playQueue([track], 0);
      return;
    }
    if (queue.some((item) => item.videoId === track.videoId)) return;

    const nextQueue = [...queue];
    if (playNext) nextQueue.splice(currentIndex + 1, 0, track);
    else nextQueue.push(track);
    set({ queue: nextQueue });
  },

  removeFromQueue: (videoId) => {
    const { queue, currentIndex, isPlaying } = get();
    const removeIndex = queue.findIndex((item) => item.videoId === videoId);
    if (removeIndex === -1) return;

    const nextQueue = queue.filter((item) => item.videoId !== videoId);

    if (!nextQueue.length) {
      set({
        queue: [],
        currentIndex: -1,
        isPlaying: false,
        status: 'idle',
        streamUrl: null,
        currentTime: 0,
        duration: 0,
        error: null
      });
      return;
    }

    let nextIndex = currentIndex;
    if (removeIndex < currentIndex) nextIndex -= 1;
    if (removeIndex === currentIndex) {
      nextIndex = Math.min(currentIndex, nextQueue.length - 1);
    }

    const changedCurrent = removeIndex === currentIndex;
    set({
      queue: nextQueue,
      currentIndex: nextIndex,
      ...(changedCurrent && isPlaying
        ? { status: 'resolving' as const, streamUrl: null, playRequestId: get().playRequestId + 1 }
        : {})
    });
  },

  clearQueue: () => {
    set({
      queue: [],
      currentIndex: -1,
      isPlaying: false,
      status: 'idle',
      error: null,
      streamUrl: null,
      currentTime: 0,
      duration: 0
    });
  },

  setStatus: (status) => set({ status }),
  setError: (error) =>
    set({
      error,
      status: error ? 'error' : get().status,
      ...(error ? { isPlaying: false } : {})
    }),
  setStream: (stream) =>
    set({
      streamUrl: stream.audioUrl,
      resolvedVia: stream.provider,
      mimeType: stream.mimeType ?? get().mimeType,
      bitrate: stream.bitrate ?? get().bitrate,
      duration: stream.duration || get().duration,
      status: 'ready',
      error: null
    }),

  setProgress: (currentTime, duration) =>
    set({
      currentTime,
      ...(typeof duration === 'number' && Number.isFinite(duration) && duration > 0
        ? { duration }
        : {})
    }),

  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: false }),
  toggleMute: () => set({ muted: !get().muted }),
  setRepeat: (repeat) => set({ repeat }),
  toggleShuffle: () => set({ shuffle: !get().shuffle }),
  setQueueOpen: (queueOpen) => set({ queueOpen }),
  setFullscreenOpen: (fullscreenOpen) => set({ fullscreenOpen }),

  retry: () =>
    set({
      status: 'resolving',
      error: null,
      isPlaying: true,
      retryNonce: get().retryNonce + 1
    })
}));

export function useCurrentTrack(): Track | null {
  const queue = usePlayerStore((state) => state.queue);
  const currentIndex = usePlayerStore((state) => state.currentIndex);
  return currentIndex >= 0 ? queue[currentIndex] ?? null : null;
}
