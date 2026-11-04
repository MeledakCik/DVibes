'use client';

import { useRef, useState } from 'react';
import {
  AlertCircle,
  AudioLines,
  ChevronDown,
  Heart,
  ListMusic,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCw,
  ScanText,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX
} from 'lucide-react';
import { useLibraryStore } from '@/lib/store/library-store';
import { useCurrentTrack, usePlayerStore } from '@/lib/store/player-store';
import { useSettingsStore } from '@/lib/store/settings-store';
import { seekAudio } from '@/lib/audio-element';
import { cn, describeCodec, formatDuration } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { useHydrated } from '@/hooks/use-hydrated';
import { useArtwork } from '@/hooks/use-artwork';
import { DownloadButton } from '@/components/download-button';

function PlayerArtwork({ src, title }: { src: string; title: string }) {
  const [broken, setBroken] = useState(false);
  if (broken || !src) {
    return (
      <div className="grid h-full w-full place-items-center bg-gradient-to-br from-lavender/25 to-sage/15">
        <AudioLines className="h-5 w-5 text-white/40" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      onError={() => setBroken(true)}
      title={title}
    />
  );
}

function Equalizer() {
  return (
    <span className="flex h-4 items-end gap-[2px]" aria-hidden="true">
      <span className="eq-bar h-2.5 w-[2px] rounded-full bg-lavender" />
      <span className="eq-bar h-4 w-[2px] rounded-full bg-lavender" />
      <span className="eq-bar h-3 w-[2px] rounded-full bg-lavender" />
      <span className="eq-bar h-3.5 w-[2px] rounded-full bg-lavender" />
    </span>
  );
}

export function Player({ onOpenLyrics }: { onOpenLyrics?: () => void }) {
  const track = useCurrentTrack();
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const status = usePlayerStore((state) => state.status);
  const error = usePlayerStore((state) => state.error);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const streamUrl = usePlayerStore((state) => state.streamUrl);
  const resolvedVia = usePlayerStore((state) => state.resolvedVia);
  const mimeType = usePlayerStore((state) => state.mimeType);
  const bitrate = usePlayerStore((state) => state.bitrate);
  const volume = usePlayerStore((state) => state.volume);
  const muted = usePlayerStore((state) => state.muted);
  const repeat = usePlayerStore((state) => state.repeat);
  const shuffle = usePlayerStore((state) => state.shuffle);
  const queue = usePlayerStore((state) => state.queue);
  const fullscreenOpen = usePlayerStore((state) => state.fullscreenOpen);

  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const toggleMute = usePlayerStore((state) => state.toggleMute);
  const setRepeat = usePlayerStore((state) => state.setRepeat);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const setQueueOpen = usePlayerStore((state) => state.setQueueOpen);
  const setFullscreenOpen = usePlayerStore((state) => state.setFullscreenOpen);
  const setProgress = usePlayerStore((state) => state.setProgress);
  const retry = usePlayerStore((state) => state.retry);

  const tuningHz = useSettingsStore((state) => state.tuningHz);
  const setTuningHz = useSettingsStore((state) => state.setTuningHz);

  const favorites = useLibraryStore((state) => state.favorites);
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const hydrated = useHydrated();

  const [dragging, setDragging] = useState(false);
  const [draftTime, setDraftTime] = useState(0);
  const [touchDeltaY, setTouchDeltaY] = useState(0);
  const touchStartYRef = useRef<number | null>(null);

  const isFavorite = hydrated && track ? favorites.some((item) => item.videoId === track.videoId) : false;
  const resolving = status === 'resolving';
  const displayedTime = dragging ? draftTime : currentTime;
  const maxTime = Math.max(duration || track?.duration || 0, 1);
  const hasTrack = !!track;
  const artwork = useArtwork(track);
  const codecBadge = describeCodec(
    mimeType ?? undefined,
    track?.fileFormat,
    bitrate ?? track?.bitrate
  );

  const cycleRepeat = () => {
    setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off');
  };

  const handlePrevious = () => {
    if (currentTime > 4) {
      seekAudio(0);
      setProgress(0);
      return;
    }
    previous();
  };

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <>
      <footer className="group/player fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-50 border-t border-white/[0.09] bg-ink-950/80 shadow-player backdrop-blur-2xl lg:bottom-0">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lavender/35 to-transparent" />
        <div className="mx-auto w-full max-w-[1680px] px-3 pb-2 pt-2 lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 md:px-6 lg:py-3">
          {/* Mobile player */}
          <div className="lg:hidden">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => hasTrack && setFullscreenOpen(true)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/10">
                  {track ? (
                    <PlayerArtwork src={artwork} title={track.title} />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-white/[0.04]">
                      <AudioLines className="h-4 w-4 text-mist/40" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-white">
                    {track ? track.title : 'Nothing playing yet'}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-mist/55">
                    {resolving && <Loader2 className="h-2.5 w-2.5 animate-spin text-lavender" />}
                    {status === 'error' ? (
                      <span className="text-red-300">stream error</span>
                    ) : (
                      <>
                        {track ? track.artist : 'Pick a track to begin'}
                        {resolvedVia && (
                          <span className="text-mist/30">
                            · {resolvedVia === 'local' ? 'saved offline' : `via ${resolvedVia}`}
                          </span>
                        )}
                      </>
                    )}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={togglePlay}
                disabled={!hasTrack}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-ink-950 shadow-lg transition active:scale-95 disabled:opacity-30"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {resolving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-4 w-4" fill="currentColor" />
                ) : (
                  <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
                )}
              </button>
              <button
                type="button"
                onClick={next}
                disabled={!hasTrack}
                className="grid h-9 w-9 shrink-0 place-items-center text-white/80 transition hover:text-white disabled:opacity-30"
                aria-label="Next track"
              >
                <SkipForward className="h-4 w-4" fill="currentColor" />
              </button>
              <button
                type="button"
                onClick={() => setQueueOpen(true)}
                className="relative grid h-9 w-9 shrink-0 place-items-center text-white/70 transition hover:text-white"
                aria-label="Open queue"
              >
                <ListMusic className="h-4 w-4" />
                {queue.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-lavender px-1 text-[8px] font-bold text-ink-950">
                    {queue.length > 99 ? '99+' : queue.length}
                  </span>
                )}
              </button>
            </div>

            <div className="mt-1 flex items-center gap-2">
              <span className="w-8 text-right text-[9px] tabular-nums text-mist/50">
                {formatDuration(displayedTime)}
              </span>
              <Slider
                value={[Math.min(displayedTime, maxTime)]}
                max={maxTime}
                step={1}
                disabled={!streamUrl}
                onValueChange={([value]) => {
                  setDragging(true);
                  setDraftTime(value);
                }}
                onValueCommit={([value]) => {
                  seekAudio(value);
                  setProgress(value);
                  setDragging(false);
                }}
                aria-label="Seek"
                className="flex-1"
              />
              <span className="w-8 text-[9px] tabular-nums text-mist/50">
                {duration > 0 ? formatDuration(duration) : '--:--'}
              </span>
              <button
                type="button"
                onClick={onOpenLyrics}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-mist/55 transition hover:bg-white/[0.06] hover:text-lavender"
                aria-label="Open synced lyrics"
                title="Open lyrics"
              >
                <ScanText className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Desktop player */}
          <div className="hidden items-center gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,1.35fr)_minmax(0,1fr)] lg:gap-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => hasTrack && setFullscreenOpen(true)}
                className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-lg transition hover:scale-105"
                title="Open fullscreen player"
              >
                {track ? (
                  <PlayerArtwork src={artwork} title={track.title} />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-white/[0.04]">
                    <AudioLines className="h-5 w-5 text-mist/40" />
                  </div>
                )}
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-white">
                    {track ? track.title : 'Nothing playing yet'}
                  </p>
                  {status === 'ready' && isPlaying && <Equalizer />}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-mist/55">
                  {track ? track.artist : 'Choose something from the live feed'}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  {resolving && (
                    <span className="flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] text-lavender/80">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      resolving
                    </span>
                  )}
                  {resolvedVia && status === 'ready' && (
                    <span className="text-[9px] uppercase tracking-[0.14em] text-mist/35">
                      {resolvedVia === 'local' ? 'saved offline' : `via ${resolvedVia}`} · {codecBadge}
                    </span>
                  )}
                </div>
              </div>
              {track && (
                <button
                  type="button"
                  onClick={() => toggleFavorite(track)}
                  className={cn(
                    'ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full transition',
                    isFavorite
                      ? 'text-rose-300'
                      : 'text-mist/45 hover:bg-white/[0.06] hover:text-white'
                  )}
                  aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Heart className={cn('h-4 w-4', isFavorite && 'fill-current')} />
                </button>
              )}
              {track && <DownloadButton track={track} className="bg-transparent hover:bg-white/[0.06]" />}
            </div>

            <div className="flex min-w-0 flex-col items-center gap-1.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleShuffle}
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-full transition',
                    shuffle ? 'text-lavender' : 'text-mist/45 hover:text-white'
                  )}
                  aria-label="Toggle shuffle"
                  aria-pressed={shuffle}
                >
                  <Shuffle className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handlePrevious}
                  disabled={!hasTrack}
                  className="grid h-9 w-9 place-items-center text-white/75 transition hover:text-white disabled:opacity-30"
                  aria-label="Previous"
                >
                  <SkipBack className="h-4 w-4" fill="currentColor" />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  disabled={!hasTrack}
                  className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink-950 shadow-[0_0_30px_-10px_rgba(255,255,255,0.7)] transition hover:scale-[1.04] active:scale-95 disabled:opacity-30"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {resolving ? (
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-[18px] w-[18px]" fill="currentColor" />
                  ) : (
                    <Play className="ml-0.5 h-[18px] w-[18px]" fill="currentColor" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={next}
                  disabled={!hasTrack}
                  className="grid h-9 w-9 place-items-center text-white/75 transition hover:text-white disabled:opacity-30"
                  aria-label="Next"
                >
                  <SkipForward className="h-4 w-4" fill="currentColor" />
                </button>
                <button
                  type="button"
                  onClick={cycleRepeat}
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-full transition',
                    repeat !== 'off' ? 'text-lavender' : 'text-mist/45 hover:text-white'
                  )}
                  aria-label={`Repeat: ${repeat}`}
                >
                  {repeat === 'one' ? (
                    <Repeat1 className="h-3.5 w-3.5" />
                  ) : (
                    <Repeat className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <div className="flex w-full items-center gap-2">
                <span className="w-9 text-right text-[9px] tabular-nums text-mist/50">
                  {formatDuration(displayedTime)}
                </span>
                <Slider
                  value={[Math.min(displayedTime, maxTime)]}
                  max={maxTime}
                  step={1}
                  disabled={!streamUrl}
                  onValueChange={([value]) => {
                    setDragging(true);
                    setDraftTime(value);
                  }}
                  onValueCommit={([value]) => {
                    seekAudio(value);
                    setProgress(value);
                    setDragging(false);
                  }}
                  aria-label="Seek"
                  className="flex-1"
                />
                <span className="w-9 text-[9px] tabular-nums text-mist/50">
                  {duration > 0 ? formatDuration(duration) : '--:--'}
                </span>
              </div>
            </div>

            <div className="flex min-w-0 items-center justify-end gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className="grid h-8 w-8 place-items-center text-mist/55 transition hover:text-white"
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                <VolumeIcon className="h-4 w-4" />
              </button>
              <Slider
                value={[muted ? 0 : volume]}
                max={1}
                step={0.01}
                onValueChange={([value]) => setVolume(value)}
                aria-label="Volume"
                className="w-24"
              />
              <button
                type="button"
                onClick={onOpenLyrics}
                className="ml-2 grid h-9 w-9 place-items-center rounded-full text-mist/60 transition hover:bg-white/[0.06] hover:text-lavender"
                aria-label="Open synced lyrics"
                title="Open lyrics"
              >
                <ScanText className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setQueueOpen(true)}
                className="relative grid h-9 w-9 place-items-center rounded-full text-mist/60 transition hover:bg-white/[0.06] hover:text-white"
                aria-label="Open queue"
              >
                <ListMusic className="h-4 w-4" />
                {queue.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-lavender px-1 text-[8px] font-bold text-ink-950">
                    {queue.length > 99 ? '99+' : queue.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => hasTrack && setFullscreenOpen(true)}
                disabled={!hasTrack}
                className="grid h-8 w-8 place-items-center rounded-full text-mist/50 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                aria-label="Open fullscreen player"
                title="Fullscreen sanctuary player"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-400/15 bg-red-400/[0.06] px-3 py-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-300" />
              <p className="min-w-0 flex-1 truncate text-[10px] text-red-200/75">{error}</p>
              <button
                type="button"
                onClick={retry}
                className="flex shrink-0 items-center gap-1 rounded-full bg-red-400/10 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.1em] text-red-200 transition hover:bg-red-400/20"
              >
                <RotateCw className="h-2.5 w-2.5" />
                retry
              </button>
            </div>
          )}
        </div>
      </footer>

      {/* Fullscreen Sanctuary Player Modal (Mobile + Desktop) */}
      {fullscreenOpen && track && (
        <div
          className="fixed inset-0 z-[90] flex flex-col justify-between overflow-y-auto bg-ink-950 p-6 select-none"
          onTouchStart={(e) => {
            touchStartYRef.current = e.touches[0].clientY;
          }}
          onTouchMove={(e) => {
            if (touchStartYRef.current === null) return;
            const delta = e.touches[0].clientY - touchStartYRef.current;
            if (delta > 0) setTouchDeltaY(delta);
          }}
          onTouchEnd={() => {
            if (touchDeltaY > 90) {
              setFullscreenOpen(false);
            }
            setTouchDeltaY(0);
            touchStartYRef.current = null;
          }}
          style={{
            transform: touchDeltaY > 0 ? `translateY(${touchDeltaY}px)` : undefined
          }}
        >
          {artwork && (
            <img
              src={artwork}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-3xl"
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950/75 via-ink-950/85 to-ink-950" />

          {/* Top Bar */}
          <div className="relative z-10 mx-auto flex w-full max-w-xl items-center justify-between">
            <button
              type="button"
              onClick={() => setFullscreenOpen(false)}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white hover:bg-white/10"
              aria-label="Minimize fullscreen player"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-lavender">
                Now Playing
              </p>
              <p className="mt-0.5 text-xs text-mist/60">
                {resolvedVia === 'local' ? 'Offline Vault' : `via ${resolvedVia || 'live'}`} · {codecBadge}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFullscreenOpen(false);
                  onOpenLyrics?.();
                }}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white hover:bg-white/10"
                aria-label="Open synced lyrics"
                title="Open synced lyrics"
              >
                <ScanText className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setFullscreenOpen(false);
                  setQueueOpen(true);
                }}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white hover:bg-white/10"
                aria-label="Open queue"
              >
                <ListMusic className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Center Artwork */}
          <div className="relative z-10 my-auto flex flex-col items-center py-6">
            <div className="aspect-square w-[290px] max-w-[80vw] overflow-hidden rounded-3xl border border-white/15 bg-ink-900 shadow-2xl sm:w-[340px]">
              <PlayerArtwork src={artwork} title={track.title} />
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-5 pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-semibold text-white">{track.title}</h2>
                <p className="mt-0.5 truncate text-sm text-mist/70">{track.artist}</p>
              </div>
              <div className="flex items-center gap-2">
                <DownloadButton track={track} size="md" />
                <button
                  type="button"
                  onClick={() => toggleFavorite(track)}
                  className={cn(
                    'grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.05]',
                    isFavorite ? 'text-rose-300' : 'text-white/75'
                  )}
                  aria-label="Toggle favorite"
                >
                  <Heart className={cn('h-4 w-4', isFavorite && 'fill-current')} />
                </button>
              </div>
            </div>

            {/* Real Pitch Tuning Pill */}
            <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs">
              <span className="text-mist/60">Harmonic Pitch Tuning</span>
              <div className="flex items-center gap-1">
                {([440, 432, 528] as const).map((hz) => (
                  <button
                    key={hz}
                    type="button"
                    onClick={() => setTuningHz(hz)}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition',
                      tuningHz === hz
                        ? 'bg-lavender text-ink-950 font-semibold'
                        : 'text-mist/60 hover:text-white'
                    )}
                  >
                    {hz}Hz
                  </button>
                ))}
              </div>
            </div>

            {/* Progress Slider */}
            <div className="space-y-1.5">
              <Slider
                value={[Math.min(displayedTime, maxTime)]}
                max={maxTime}
                step={1}
                disabled={!streamUrl}
                onValueChange={([value]) => {
                  setDragging(true);
                  setDraftTime(value);
                }}
                onValueCommit={([value]) => {
                  seekAudio(value);
                  setProgress(value);
                  setDragging(false);
                }}
                aria-label="Seek"
              />
              <div className="flex justify-between font-mono text-xs text-mist/55">
                <span>{formatDuration(displayedTime)}</span>
                <span>{duration > 0 ? formatDuration(duration) : '--:--'}</span>
              </div>
            </div>

            {/* Large Transport Controls */}
            <div className="flex items-center justify-between px-2">
              <button
                type="button"
                onClick={toggleShuffle}
                className={cn(
                  'grid h-10 w-10 place-items-center rounded-full',
                  shuffle ? 'bg-lavender/20 text-lavender' : 'text-mist/60 hover:text-white'
                )}
                aria-label="Toggle shuffle"
              >
                <Shuffle className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={handlePrevious}
                className="grid h-12 w-12 place-items-center rounded-full text-white hover:bg-white/10"
                aria-label="Previous"
              >
                <SkipBack className="h-6 w-6" fill="currentColor" />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                className="grid h-16 w-16 place-items-center rounded-full bg-lavender text-ink-950 shadow-2xl transition hover:scale-105 active:scale-95"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {resolving ? (
                  <Loader2 className="h-7 w-7 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-7 w-7" fill="currentColor" />
                ) : (
                  <Play className="ml-1 h-7 w-7" fill="currentColor" />
                )}
              </button>
              <button
                type="button"
                onClick={next}
                className="grid h-12 w-12 place-items-center rounded-full text-white hover:bg-white/10"
                aria-label="Next"
              >
                <SkipForward className="h-6 w-6" fill="currentColor" />
              </button>
              <button
                type="button"
                onClick={cycleRepeat}
                className={cn(
                  'grid h-10 w-10 place-items-center rounded-full',
                  repeat !== 'off' ? 'bg-lavender/20 text-lavender' : 'text-mist/60 hover:text-white'
                )}
                aria-label="Repeat"
              >
                {repeat === 'one' ? (
                  <Repeat1 className="h-5 w-5" />
                ) : (
                  <Repeat className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
