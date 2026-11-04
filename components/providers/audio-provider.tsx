'use client';

import { useEffect, useRef } from 'react';
import {
  evictCachedStream,
  resolveStreamClient,
  ApiClientError
} from '@/lib/api/client';
import { resolveFallbackByMeta } from '@/lib/api/piped';
import {
  acquirePlaybackKeepAlive,
  applyAudioElementTuning,
  cacheRemoteStreamNative,
  isNative,
  releasePlaybackKeepAlive
} from '@/lib/native/platform';
import {
  registerAudioElement,
  seekAudio,
  setAudioTuning,
  setAudioVolume
} from '@/lib/audio-element';
import { useCurrentTrack, usePlayerStore } from '@/lib/store/player-store';
import { localAudioUrl, useDownloadsStore, useOfflineStore } from '@/lib/store/downloads-store';
import { isOffline, startNetworkWatcher } from '@/lib/store/network-store';
import { useSettingsStore } from '@/lib/store/settings-store';
import type { StreamCandidate } from '@/lib/types';

function playbackErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'TIMEOUT') {
      return 'The stream took too long to resolve. Tap Retry and another mirror will be tried.';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Could not play this track.';
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastRetryNonce = useRef(0);
  const candidatesRef = useRef<StreamCandidate[]>([]);
  const candidateIndexRef = useRef(0);
  const nativeCacheAttemptedRef = useRef<Set<string>>(new Set());
  const metaFallbackAttemptedRef = useRef(false);
  const failingOverRef = useRef(false);

  const track = useCurrentTrack();
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const streamUrl = usePlayerStore((state) => state.streamUrl);
  const status = usePlayerStore((state) => state.status);
  const volume = usePlayerStore((state) => state.volume);
  const muted = usePlayerStore((state) => state.muted);
  const playRequestId = usePlayerStore((state) => state.playRequestId);
  const retryNonce = usePlayerStore((state) => state.retryNonce);
  const downloadsReady = useDownloadsStore((state) => state.ready);
  const tuningHz = useSettingsStore((state) => state.tuningHz);

  useEffect(() => {
    startNetworkWatcher();
    void useDownloadsStore.getState().init();
  }, []);

  useEffect(() => {
    registerAudioElement(audioRef.current);
    return () => registerAudioElement(null);
  }, []);

  useEffect(() => {
    setAudioVolume(volume, muted);
  }, [volume, muted]);

  useEffect(() => {
    setAudioTuning(tuningHz);
  }, [tuningHz]);

  useEffect(() => {
    if (isPlaying && status === 'ready') {
      void acquirePlaybackKeepAlive();
    } else if (!isPlaying) {
      void releasePlaybackKeepAlive();
    }
  }, [isPlaying, status]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (document.visibilityState === 'hidden' && usePlayerStore.getState().isPlaying) {
        void acquirePlaybackKeepAlive();
        if (audio.paused && audio.currentSrc) {
          audio.play().catch(() => undefined);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const loadAudioSource = (
    url: string,
    provider: StreamCandidate['provider'],
    mimeType?: string,
    bitrate?: number
  ) => {
    const audio = audioRef.current;
    const currentTrack = usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex];
    if (!audio || !currentTrack) return;

    audio.pause();
    audio.src = url;
    try {
      audio.currentTime = 0;
    } catch {
      // not seekable yet
    }
    applyAudioElementTuning(audio, useSettingsStore.getState().tuningHz);
    audio.load();

    usePlayerStore.getState().setStream({
      videoId: currentTrack.videoId,
      audioUrl: url,
      title: currentTrack.title,
      artist: currentTrack.artist,
      thumbnail: currentTrack.thumbnail,
      duration: currentTrack.duration,
      provider,
      mimeType,
      bitrate,
      expiresAt: Date.now() + 60 * 60 * 1000
    });
  };

  useEffect(() => {
    if (!track) return;

    let cancelled = false;
    const force = retryNonce !== lastRetryNonce.current;
    lastRetryNonce.current = retryNonce;
    candidatesRef.current = [];
    candidateIndexRef.current = 0;
    nativeCacheAttemptedRef.current = new Set();
    metaFallbackAttemptedRef.current = false;
    failingOverRef.current = false;

    const store = usePlayerStore.getState();
    store.setStatus('resolving');
    store.setError(null);

    const resolveAndPlay = async () => {
      if (track.isLocalFile || track.source === 'local') {
        const vaultUrl = await useOfflineStore.getState().resolveLocalPlayableUrl(track.videoId);
        if (cancelled) return;
        if (vaultUrl) {
          loadAudioSource(
            vaultUrl,
            'local',
            track.fileFormat ? `audio/${track.fileFormat.toLowerCase()}` : undefined,
            track.bitrate
          );
          return;
        }
        store.setError(
          'Local audio file is no longer in storage. Re-import the file in the Offline tab.'
        );
        return;
      }

      const downloadedUrl = localAudioUrl(track.videoId);
      if (downloadedUrl) {
        const meta = useDownloadsStore.getState().meta[track.videoId];
        loadAudioSource(downloadedUrl, 'local', meta?.mimeType, track.bitrate);
        return;
      }

      if (isOffline()) {
        store.setError(
          'Not saved for offline. Download this track while online, import a local file, or turn offline mode off.'
        );
        return;
      }

      try {
        const stream = await resolveStreamClient(track.videoId, {
          force,
          title: track.title,
          artist: track.artist,
          directStreamUrl: track.directStreamUrl
        });
        if (cancelled) return;

        const candidates: StreamCandidate[] = stream.candidates?.length
          ? stream.candidates
          : [
              {
                url: stream.audioUrl,
                provider: stream.provider,
                mimeType: stream.mimeType,
                bitrate: stream.bitrate,
                userAgent: stream.userAgent
              }
            ];

        candidatesRef.current = candidates;
        candidateIndexRef.current = 0;
        const first = candidates[0];

        if (
          isNative() &&
          (first.provider === 'innertube' || first.url.includes('googlevideo.com'))
        ) {
          nativeCacheAttemptedRef.current.add(first.url);
          try {
            const localCachedUrl = await cacheRemoteStreamNative({
              videoId: track.videoId,
              url: first.url,
              userAgent: first.userAgent || stream.userAgent,
              mimeType: first.mimeType || stream.mimeType
            });
            if (cancelled) return;
            if (localCachedUrl) {
              loadAudioSource(
                localCachedUrl,
                first.provider,
                first.mimeType || stream.mimeType,
                first.bitrate || stream.bitrate
              );
              return;
            }
          } catch {
            // Fall through and let <audio> try the URL or next candidate
          }
        }

        if (cancelled) return;
        loadAudioSource(
          first.url,
          first.provider,
          first.mimeType || stream.mimeType,
          first.bitrate || stream.bitrate
        );
      } catch (error) {
        if (cancelled) return;
        usePlayerStore.getState().setError(playbackErrorMessage(error));
      }
    };

    void resolveAndPlay();

    return () => {
      cancelled = true;
    };
  }, [track?.videoId, playRequestId, retryNonce, downloadsReady]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !streamUrl) return;

    if (!isPlaying) {
      audio.pause();
      return;
    }

    applyAudioElementTuning(audio, useSettingsStore.getState().tuningHz);
    const promise = audio.play();
    if (promise) {
      promise
        .then(() => usePlayerStore.getState().setError(null))
        .catch((error: DOMException) => {
          if (error?.name === 'AbortError') return;
          if (error?.name === 'NotAllowedError') {
            usePlayerStore.setState({ isPlaying: false });
            usePlayerStore.getState().setError(null);
            return;
          }
          audio.dispatchEvent(new Event('error'));
        });
    }
  }, [isPlaying, streamUrl, status]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      const store = usePlayerStore.getState();
      store.setProgress(audio.currentTime, audio.duration);

      if ('mediaSession' in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate || 1,
            position: Math.min(audio.currentTime, audio.duration)
          });
        } catch {
          // unsupported in some browsers
        }
      }
    };

    const onLoadedMetadata = () => {
      applyAudioElementTuning(audio, useSettingsStore.getState().tuningHz);
      usePlayerStore.getState().setProgress(audio.currentTime, audio.duration);
    };

    const onPlay = () => {
      usePlayerStore.setState({ isPlaying: true });
    };

    const onPause = () => {
      if (!audio.ended && document.visibilityState === 'visible') {
        usePlayerStore.setState({ isPlaying: false });
      }
    };

    const onEnded = () => {
      usePlayerStore.getState().handleEnded();
    };

    const onError = () => {
      if (!audio.currentSrc || failingOverRef.current) return;
      const state = usePlayerStore.getState();
      const currentTrack = state.queue[state.currentIndex];
      if (!currentTrack) return;

      if (state.resolvedVia === 'local') {
        state.setError('The saved file could not be read. Remove the download and save it again.');
        void useDownloadsStore.getState().init();
        return;
      }

      failingOverRef.current = true;
      state.setStatus('resolving');

      const tryFailover = async () => {
        try {
          const candidates = candidatesRef.current;
          const currentCandidate = candidates[candidateIndexRef.current];

          if (
            isNative() &&
            currentCandidate &&
            !nativeCacheAttemptedRef.current.has(currentCandidate.url)
          ) {
            nativeCacheAttemptedRef.current.add(currentCandidate.url);
            try {
              const cachedUrl = await cacheRemoteStreamNative({
                videoId: currentTrack.videoId,
                url: currentCandidate.url,
                userAgent: currentCandidate.userAgent,
                mimeType: currentCandidate.mimeType
              });
              if (cachedUrl) {
                failingOverRef.current = false;
                loadAudioSource(
                  cachedUrl,
                  currentCandidate.provider,
                  currentCandidate.mimeType,
                  currentCandidate.bitrate
                );
                return;
              }
            } catch {
              // continue to next candidate
            }
          }

          while (candidateIndexRef.current + 1 < candidates.length) {
            candidateIndexRef.current += 1;
            const nextCandidate = candidates[candidateIndexRef.current];
            if (!nextCandidate?.url) continue;

            if (
              isNative() &&
              (nextCandidate.provider === 'innertube' ||
                nextCandidate.url.includes('googlevideo.com')) &&
              !nativeCacheAttemptedRef.current.has(nextCandidate.url)
            ) {
              nativeCacheAttemptedRef.current.add(nextCandidate.url);
              try {
                const cachedUrl = await cacheRemoteStreamNative({
                  videoId: currentTrack.videoId,
                  url: nextCandidate.url,
                  userAgent: nextCandidate.userAgent,
                  mimeType: nextCandidate.mimeType
                });
                if (cachedUrl) {
                  failingOverRef.current = false;
                  loadAudioSource(
                    cachedUrl,
                    nextCandidate.provider,
                    nextCandidate.mimeType,
                    nextCandidate.bitrate
                  );
                  return;
                }
              } catch {
                continue;
              }
            }

            failingOverRef.current = false;
            loadAudioSource(
              nextCandidate.url,
              nextCandidate.provider,
              nextCandidate.mimeType,
              nextCandidate.bitrate
            );
            return;
          }

          if (!metaFallbackAttemptedRef.current && currentTrack.title) {
            metaFallbackAttemptedRef.current = true;
            try {
              const fallback = await resolveFallbackByMeta(
                currentTrack.videoId,
                currentTrack.title,
                currentTrack.artist
              );
              if (fallback?.audioUrl) {
                failingOverRef.current = false;
                loadAudioSource(
                  fallback.audioUrl,
                  fallback.provider,
                  fallback.mimeType,
                  fallback.bitrate
                );
                return;
              }
            } catch {
              // all fallbacks exhausted
            }
          }

          evictCachedStream(currentTrack.videoId);
          failingOverRef.current = false;
          const code = audio.error?.code;
          const message =
            code === 4
              ? 'All stream mirrors rejected or expired this audio format. Tap Retry to resolve a fresh URL.'
              : 'The audio stream could not be loaded from any mirror. Tap Retry to try another provider.';
          usePlayerStore.getState().setError(message);
        } catch {
          failingOverRef.current = false;
          usePlayerStore
            .getState()
            .setError('The audio stream could not be loaded. Tap Retry to try another provider.');
        }
      };

      void tryFailover();
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return;

    const artwork = track.thumbnail
      ? [
          { src: track.thumbnail, sizes: '96x96', type: 'image/jpeg' },
          { src: track.thumbnail, sizes: '256x256', type: 'image/jpeg' },
          { src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' }
        ]
      : [];

    if (typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || 'DVibes',
        artwork
      });
    }

    const safeHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // action not supported
      }
    };

    safeHandler('play', () => {
      if (!usePlayerStore.getState().isPlaying) usePlayerStore.getState().togglePlay();
    });
    safeHandler('pause', () => {
      if (usePlayerStore.getState().isPlaying) usePlayerStore.getState().togglePlay();
    });
    safeHandler('previoustrack', () => usePlayerStore.getState().previous());
    safeHandler('nexttrack', () => usePlayerStore.getState().next());
    safeHandler('seekbackward', (details) => {
      const audio = audioRef.current;
      if (!audio) return;
      const time = Math.max(0, audio.currentTime - (details.seekOffset || 10));
      seekAudio(time);
      usePlayerStore.getState().setProgress(time);
    });
    safeHandler('seekforward', (details) => {
      const audio = audioRef.current;
      if (!audio) return;
      const time = Math.min(audio.duration || Infinity, audio.currentTime + (details.seekOffset || 10));
      seekAudio(time);
      usePlayerStore.getState().setProgress(time);
    });
    safeHandler('seekto', (details) => {
      if (typeof details.seekTime !== 'number') return;
      seekAudio(details.seekTime);
      usePlayerStore.getState().setProgress(details.seekTime);
    });

    return () => {
      safeHandler('play', null);
      safeHandler('pause', null);
      safeHandler('previoustrack', null);
      safeHandler('nexttrack', null);
      safeHandler('seekbackward', null);
      safeHandler('seekforward', null);
      safeHandler('seekto', null);
    };
  }, [track]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {
      // ignore
    }
  }, [isPlaying, status]);

  return (
    <>
      {children}
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        // @ts-expect-error referrerPolicy is supported on HTMLAudioElement/media elements in modern Chromium/WebKit
        referrerPolicy="no-referrer"
        className="hidden"
      />
    </>
  );
}
