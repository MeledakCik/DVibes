'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  AudioLines,
  AudioWaveform,
  Check,
  ChevronsDown,
  Clock3,
  CloudRain,
  Copy,
  Database,
  Disc3,
  FileText,
  Flame,
  Heart,
  Mic2,
  Minus,
  Music2,
  Pause,
  Play,
  Plus,
  Quote,
  RefreshCw,
  RotateCw,
  ScanText,
  SkipBack,
  SkipForward,
  Sparkles,
  Type,
  Upload,
  Wind,
  X
} from 'lucide-react';
import { ApiClientError, fetchLyrics } from '@/lib/api/client';
import type { AmbientStemId, TuningHz } from '@/lib/native/platform';
import { seekAudio } from '@/lib/audio-element';
import { useHydrated } from '@/hooks/use-hydrated';
import { useArtwork } from '@/hooks/use-artwork';
import { DownloadButton } from '@/components/download-button';
import { useLibraryStore } from '@/lib/store/library-store';
import { useOfflineStore } from '@/lib/store/downloads-store';
import { useCurrentTrack, usePlayerStore } from '@/lib/store/player-store';
import { useSettingsStore } from '@/lib/store/settings-store';
import type { LyricLine, LyricsPayload } from '@/lib/types';
import { clamp, cn, describeCodec, formatDuration } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Skeleton } from '@/components/ui/skeleton';

interface LyricsViewProps {
  onExplore: () => void;
}

type LyricsError = {
  message: string;
  code?: string;
  attempts?: string[];
};

type Viz = 'synced' | 'karaoke' | 'ambient' | 'wave';

const VIZ_TABS: Array<{ id: Viz; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'synced', label: 'Synced Lyrics', icon: ScanText },
  { id: 'karaoke', label: 'Karaoke Flow', icon: Mic2 },
  { id: 'ambient', label: 'Ambient Typography', icon: Type },
  { id: 'wave', label: 'Spectrum Wave', icon: AudioWaveform }
];

const ZOOM_MIN = 70;
const ZOOM_MAX = 150;
const ZOOM_STEP = 10;
const ZOOM_PRESETS = [
  { label: 'Sm', value: 85 },
  { label: 'Md', value: 100 },
  { label: 'Lg', value: 120 },
  { label: 'XL', value: 140 }
];

const QUICK_STEMS: Array<{
  id: AmbientStemId;
  label: string;
  defaultLevel: number;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'rain', label: 'Rain', defaultLevel: 55, icon: CloudRain },
  { id: 'vinyl', label: 'Vinyl', defaultLevel: 45, icon: Disc3 },
  { id: 'fire', label: 'Fire', defaultLevel: 50, icon: Flame },
  { id: 'wind', label: 'Wind', defaultLevel: 40, icon: Wind }
];

function formatStamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function sourceLabel(payload: LyricsPayload | null): string {
  if (!payload) return 'live lookup';
  if (payload.provider === 'local') return 'Imported .LRC';
  return payload.provider === 'lrclib' ? 'LRCLIB' : 'lyrics.ovh';
}

function activeLineIndex(lines: LyricLine[], time: number): number {
  if (!lines.length) return -1;
  let low = 0;
  let high = lines.length - 1;
  let result = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lines[middle].time <= time) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
}

export function LyricsView({ onExplore }: LyricsViewProps) {
  const track = useCurrentTrack();
  const currentTime = usePlayerStore((state) => state.currentTime);
  const storeDuration = usePlayerStore((state) => state.duration);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const status = usePlayerStore((state) => state.status);
  const resolvedVia = usePlayerStore((state) => state.resolvedVia);
  const mimeType = usePlayerStore((state) => state.mimeType);
  const bitrate = usePlayerStore((state) => state.bitrate);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);
  const setProgress = usePlayerStore((state) => state.setProgress);

  const favorites = useLibraryStore((state) => state.favorites);
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);

  const customLyricsMap = useOfflineStore((state) => state.customLyrics);
  const importFiles = useOfflineStore((state) => state.importFiles);
  const saveCustomLyricsText = useOfflineStore((state) => state.saveCustomLyricsText);
  const removeCustomLyrics = useOfflineStore((state) => state.removeCustomLyrics);

  const tuningHz = useSettingsStore((state) => state.tuningHz);
  const setTuningHz = useSettingsStore((state) => state.setTuningHz);
  const ambientStems = useSettingsStore((state) => state.ambientStems);
  const setAmbientStem = useSettingsStore((state) => state.setAmbientStem);

  const hydrated = useHydrated();

  const [payload, setPayload] = useState<LyricsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LyricsError | null>(null);
  const [offset, setOffset] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [autoScroll, setAutoScroll] = useState(true);
  const [mode, setMode] = useState<'synced' | 'plain'>('synced');
  const [viz, setViz] = useState<Viz>('synced');
  const [showLrcModal, setShowLrcModal] = useState(false);
  const [lrcDraft, setLrcDraft] = useState('');
  const [copiedQuote, setCopiedQuote] = useState(false);

  const artwork = useArtwork(track);
  const lrcFileInputRef = useRef<HTMLInputElement | null>(null);

  const requestId = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef(new Map<number, HTMLButtonElement>());
  const userScrollAt = useRef(0);

  const customForTrack = track ? customLyricsMap[track.videoId] : undefined;

  const load = useCallback(
    async (force: boolean) => {
      if (!track) return;

      const id = requestId.current + 1;
      requestId.current = id;
      setLoading(true);
      setError(null);
      if (force) setPayload(null);

      try {
        const data = await fetchLyrics(track, { force });
        if (requestId.current !== id) return;
        setPayload(data);
      } catch (caught) {
        if (requestId.current !== id) return;
        setError({
          message: caught instanceof Error ? caught.message : 'Lyrics could not be loaded.',
          code: caught instanceof ApiClientError ? caught.code : undefined,
          attempts: caught instanceof ApiClientError ? caught.attempts : undefined
        });
      } finally {
        if (requestId.current === id) setLoading(false);
      }
    },
    [track]
  );

  useEffect(() => {
    if (customForTrack) {
      setPayload(customForTrack);
      setError(null);
      setLoading(false);
    }
  }, [customForTrack]);

  useEffect(() => {
    setOffset(0);
    setAutoScroll(true);
    setMode('synced');
    userScrollAt.current = 0;

    if (!track) {
      requestId.current += 1;
      setPayload(null);
      setError(null);
      setLoading(false);
      return;
    }

    setPayload(null);
    setError(null);
    void load(false);

    return () => {
      requestId.current += 1;
    };
  }, [track, load]);

  useEffect(() => {
    if (!payload) return;
    setMode(payload.synced ? 'synced' : 'plain');
  }, [payload?.videoId, payload?.synced]);

  const timedLines = payload?.synced ? payload.lines : [];
  const totalDuration = Math.max(
    storeDuration || 0,
    track?.duration || 0,
    payload?.duration || 0,
    timedLines.length ? timedLines[timedLines.length - 1].time + 4 : 0,
    1
  );

  const syncTime = Math.max(0, currentTime - offset);
  const activeIndex = useMemo(
    () => (timedLines.length ? activeLineIndex(timedLines, syncTime) : -1),
    [timedLines, syncTime]
  );

  const lineProgress = useMemo(() => {
    if (activeIndex < 0 || !timedLines[activeIndex]) return 0;
    const start = timedLines[activeIndex].time;
    const end = timedLines[activeIndex + 1]?.time ?? start + 5;
    return clamp((syncTime - start) / Math.max(0.6, end - start), 0, 1);
  }, [timedLines, activeIndex, syncTime]);

  const canShowSynced = !!(payload?.synced && payload.lines.length);
  const effectiveMode = canShowSynced && (mode === 'synced' || !payload?.plain) ? 'synced' : 'plain';
  const focusIndex = activeIndex >= 0 ? activeIndex : 0;
  const focusLine = timedLines[focusIndex];
  const progress = clamp(currentTime / totalDuration, 0, 1);
  const isFavorite = hydrated && track ? favorites.some((item) => item.videoId === track.videoId) : false;
  const plainPreview = payload?.plain
    ? payload.plain
        .split('\n')
        .map((line) => line.trim())
        .find(Boolean) ?? null
    : null;

  const realCodecLabel = describeCodec(
    mimeType ?? undefined,
    track?.fileFormat,
    bitrate ?? track?.bitrate
  );

  const seekTo = (time: number, shouldPlay = false) => {
    const target = clamp(time, 0, Math.max(totalDuration, time));
    seekAudio(target);
    setProgress(target);
    if (shouldPlay && !isPlaying) togglePlay();
  };

  useEffect(() => {
    if (!autoScroll || activeIndex < 0 || effectiveMode !== 'synced') return;
    if (Date.now() - userScrollAt.current < 3500) return;

    const container = scrollRef.current;
    const element = lineRefs.current.get(activeIndex);
    if (!container || !element) return;

    const top = element.offsetTop - container.clientHeight / 2 + element.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [activeIndex, autoScroll, effectiveMode]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [payload?.videoId]);

  const changeZoom = (delta: number) => {
    setZoom((value) => clamp(value + delta, ZOOM_MIN, ZOOM_MAX));
  };

  const changeOffset = (delta: number) => {
    setOffset((value) => Math.round(clamp(value + delta, -10, 10) * 10) / 10);
  };

  const handleLrcFileChosen = async (files: FileList | null) => {
    if (!files?.length || !track) return;
    await importFiles(files, track);
  };

  const handleCopyQuote = (quoteText: string) => {
    if (!track) return;
    const formatted = `“${quoteText}” — ${track.title} (${track.artist})`;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(formatted);
    }
    setCopiedQuote(true);
    setTimeout(() => setCopiedQuote(false), 2000);
  };

  if (!track) {
    return (
      <div className="space-y-6">
        <TrustLine realCodecLabel="No active stream" tuningHz={tuningHz} onChangeTuning={setTuningHz} />
        <EmptyState
          icon={<ScanText className="h-6 w-6" />}
          title="Nothing on the lyric stage yet"
          message="Play a track from Home, Search, or your Offline Library. DVibes will fetch its synced lyrics from LRCLIB or let you attach a local .lrc file."
          action={
            <Button type="button" onClick={onExplore}>
              <Music2 className="h-4 w-4" />
              Browse live music
            </Button>
          }
        />
      </div>
    );
  }

  const statusLabel =
    status === 'resolving'
      ? 'resolving'
      : status === 'error'
        ? 'stream error'
        : isPlaying
          ? 'playing'
          : 'paused';

  return (
    <div className="space-y-5">
      <input
        ref={lrcFileInputRef}
        type="file"
        accept=".lrc,.txt"
        className="hidden"
        onChange={(e) => {
          void handleLrcFileChosen(e.target.files);
          e.currentTarget.value = '';
        }}
      />

      <TrustLine
        payload={payload}
        loading={loading}
        realCodecLabel={realCodecLabel}
        tuningHz={tuningHz}
        onChangeTuning={setTuningHz}
        onImportLrc={() => lrcFileInputRef.current?.click()}
        onOpenPasteLrc={() => {
          if (payload?.synced) {
            const serialized = payload.lines
              .map((l) => {
                const m = String(Math.floor(l.time / 60)).padStart(2, '0');
                const s = (l.time % 60).toFixed(2).padStart(5, '0');
                return `[${m}:${s}] ${l.text}`;
              })
              .join('\n');
            setLrcDraft(serialized);
          } else {
            setLrcDraft(payload?.plain ?? '');
          }
          setShowLrcModal(true);
        }}
      />

      <VizTabs value={viz} onChange={setViz} timedAvailable={canShowSynced} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6 xl:gap-8">
        <div className="flex w-full flex-col gap-4 lg:col-span-5 lg:sticky lg:top-4 lg:self-start">
          <div className="relative mx-auto w-full max-w-[320px] sm:max-w-[380px] lg:max-w-[420px]">
            <div className="pointer-events-none absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-lavender/25 via-[#8b5cf6]/10 to-sage/10 blur-2xl" />
            <div
              className={cn(
                'pointer-events-none absolute inset-y-4 left-14 right-0 rounded-full border border-white/[0.08] bg-[radial-gradient(circle_at_center,rgba(8,8,11,0.98)_12%,rgba(34,33,40,1)_13%,rgba(14,14,18,1)_40%,rgba(30,29,36,1)_41%,rgba(10,10,14,1)_70%)] opacity-85 shadow-2xl transition-transform duration-700',
                isPlaying && status === 'ready' && 'animate-[spin_18s_linear_infinite]'
              )}
            />

            <div className="relative z-10 aspect-square overflow-hidden rounded-3xl border border-white/10 bg-ink-800 shadow-[0_30px_80px_-35px_rgba(0,0,0,0.95)]">
              <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-lavender/20 via-ink-800 to-sage/10">
                <Music2 className="h-12 w-12 text-white/20" />
              </div>
              {artwork ? (
                <img
                  src={artwork}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : null}

              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/10" />

              <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
                <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.14em] text-white/80 backdrop-blur-md">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      status === 'error'
                        ? 'bg-red-400'
                        : status === 'resolving'
                          ? 'animate-pulse bg-[#fbbf24]'
                          : isPlaying
                            ? 'animate-pulse bg-sage'
                            : 'bg-mist/50'
                    )}
                  />
                  {statusLabel}
                </span>
                <div className="flex items-center gap-1.5">
                  <DownloadButton track={track} size="md" className="bg-black/55" />
                  <button
                    type="button"
                    onClick={() => toggleFavorite(track)}
                    className={cn(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/55 backdrop-blur-md transition hover:bg-black/75',
                      isFavorite ? 'text-rose-300' : 'text-white/70 hover:text-white'
                    )}
                    aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Heart className={cn('h-4 w-4', isFavorite && 'fill-current')} />
                  </button>
                </div>
              </div>

              <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                <div className="rounded-2xl border border-white/10 bg-black/45 p-3 backdrop-blur-xl sm:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h1
                        className="truncate text-base font-semibold tracking-tight text-white sm:text-lg"
                        title={track.title}
                      >
                        {track.title}
                      </h1>
                      <p className="mt-0.5 truncate text-xs text-lavender/90" title={track.artist}>
                        {track.artist}
                      </p>
                      {track.album && (
                        <p className="mt-0.5 truncate text-[10px] text-mist/50">{track.album}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {resolvedVia === 'local'
                        ? 'saved offline'
                        : resolvedVia
                          ? `via ${resolvedVia}`
                          : 'live'}
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={previous}
                        className="grid h-9 w-9 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                        aria-label="Previous track"
                      >
                        <SkipBack className="h-4 w-4" fill="currentColor" />
                      </button>
                      <button
                        type="button"
                        onClick={togglePlay}
                        className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink-950 shadow-[0_0_30px_-10px_rgba(255,255,255,0.75)] transition hover:scale-[1.04] active:scale-95"
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                      >
                        {isPlaying ? (
                          <Pause className="h-[18px] w-[18px]" fill="currentColor" />
                        ) : (
                          <Play className="ml-0.5 h-[18px] w-[18px]" fill="currentColor" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={next}
                        className="grid h-9 w-9 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                        aria-label="Next track"
                      >
                        <SkipForward className="h-4 w-4" fill="currentColor" />
                      </button>
                    </div>

                    <div className="text-right">
                      <p className="font-mono text-[11px] tabular-nums text-white/80">
                        {formatStamp(currentTime)} / {formatStamp(totalDuration)}
                      </p>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-mist/45">
                        {realCodecLabel}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <ResonanceSpectrum
            playing={isPlaying && status === 'ready'}
            progress={progress}
            local={resolvedVia === 'local'}
            ambientStems={ambientStems}
            onToggleStem={(id, defaultLevel) => {
              const current = ambientStems[id] || 0;
              setAmbientStem(id, current > 0 ? 0 : defaultLevel);
            }}
          />

          <QuoteCard
            payload={payload}
            loading={loading}
            error={error}
            mode={effectiveMode}
            focusLine={focusLine}
            activeIndex={activeIndex}
            plainPreview={plainPreview}
            copied={copiedQuote}
            onSeek={() => focusLine && seekTo(focusLine.time)}
            onCopy={handleCopyQuote}
          />

          <ProvenanceCard
            payload={payload}
            loading={loading}
            error={error}
            hasCustomLyrics={!!customForTrack}
            onClearCustomLyrics={() => {
              removeCustomLyrics(track.videoId);
              void load(true);
            }}
          />
        </div>

        <div className="flex w-full min-w-0 flex-col gap-3 lg:col-span-7">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 backdrop-blur-md sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-lavender" />
                  Real-Time Lyrics
                </span>
                <Badge variant={payload?.synced ? 'sage' : payload ? 'outline' : 'muted'}>
                  {loading ? 'fetching' : payload?.synced ? 'synced' : payload ? 'plain' : 'idle'}
                </Badge>
                {payload && (
                  <span className="text-[10px] uppercase tracking-[0.14em] text-mist/40">
                    {sourceLabel(payload)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => lrcFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[10px] font-medium text-mist/80 transition hover:border-lavender/40 hover:text-white"
                  title="Import a local .lrc or .txt file for this song"
                >
                  <Upload className="h-3 w-3 text-lavender" />
                  Import .LRC
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (payload?.synced) {
                      const serialized = payload.lines
                        .map((l) => {
                          const m = String(Math.floor(l.time / 60)).padStart(2, '0');
                          const s = (l.time % 60).toFixed(2).padStart(5, '0');
                          return `[${m}:${s}] ${l.text}`;
                        })
                        .join('\n');
                      setLrcDraft(serialized);
                    } else {
                      setLrcDraft(payload?.plain ?? '');
                    }
                    setShowLrcModal(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[10px] font-medium text-mist/80 transition hover:border-lavender/40 hover:text-white"
                  title="Paste or edit LRC timestamps"
                >
                  <FileText className="h-3 w-3 text-sage" />
                  Paste LRC
                </button>

                {payload && (
                  <div className="flex items-center gap-0.5 rounded-full bg-black/30 p-0.5">
                    <button
                      type="button"
                      onClick={() => setMode('synced')}
                      disabled={!payload.synced}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[10px] font-medium transition',
                        effectiveMode === 'synced'
                          ? 'bg-lavender/20 text-lavender'
                          : 'text-mist/55 hover:text-white',
                        !payload.synced && 'cursor-not-allowed opacity-35'
                      )}
                    >
                      Synced
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('plain')}
                      disabled={!payload.plain}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[10px] font-medium transition',
                        effectiveMode === 'plain'
                          ? 'bg-white/10 text-white'
                          : 'text-mist/55 hover:text-white',
                        !payload.plain && 'cursor-not-allowed opacity-35'
                      )}
                    >
                      Plain
                    </button>
                  </div>
                )}
              </div>
            </div>

            {payload && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {payload.synced && (
                  <>
                    <div className="flex items-center gap-1 rounded-full bg-black/25 px-1 py-0.5">
                      <span className="hidden px-1 text-[9px] uppercase tracking-[0.14em] text-mist/40 sm:inline">
                        sync
                      </span>
                      <button
                        type="button"
                        onClick={() => changeOffset(-0.5)}
                        className="rounded-full px-2 py-1 text-[10px] font-medium text-mist/65 transition hover:bg-white/[0.06] hover:text-white"
                        aria-label="Show lyrics 0.5 seconds earlier"
                      >
                        −0.5s
                      </button>
                      <button
                        type="button"
                        onClick={() => setOffset(0)}
                        className="w-12 rounded-full px-1 py-1 text-center font-mono text-[10px] tabular-nums text-lavender/90 transition hover:bg-white/[0.06]"
                        aria-label="Reset sync offset"
                        title="Reset sync offset"
                      >
                        {offset > 0 ? '+' : ''}
                        {offset.toFixed(1)}s
                      </button>
                      <button
                        type="button"
                        onClick={() => changeOffset(0.5)}
                        className="rounded-full px-2 py-1 text-[10px] font-medium text-mist/65 transition hover:bg-white/[0.06] hover:text-white"
                        aria-label="Show lyrics 0.5 seconds later"
                      >
                        +0.5s
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setAutoScroll((value) => !value)}
                      aria-pressed={autoScroll}
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-medium transition',
                        autoScroll
                          ? 'bg-lavender/15 text-lavender'
                          : 'bg-black/25 text-mist/55 hover:text-white'
                      )}
                    >
                      <ChevronsDown className="h-3 w-3" />
                      Auto-scroll
                    </button>
                  </>
                )}

                <div className="ml-auto flex flex-wrap items-center gap-1 rounded-full bg-black/25 px-1.5 py-0.5">
                  <button
                    type="button"
                    onClick={() => changeZoom(-ZOOM_STEP)}
                    disabled={zoom <= ZOOM_MIN}
                    className="grid h-6 w-6 place-items-center rounded-full text-mist/60 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                    aria-label="Decrease lyric size"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <input
                    type="range"
                    min={ZOOM_MIN}
                    max={ZOOM_MAX}
                    step={5}
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                    className="h-1 w-16 cursor-pointer accent-lavender sm:w-20"
                    aria-label="Lyric text size"
                  />
                  <button
                    type="button"
                    onClick={() => changeZoom(ZOOM_STEP)}
                    disabled={zoom >= ZOOM_MAX}
                    className="grid h-6 w-6 place-items-center rounded-full text-mist/60 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                    aria-label="Increase lyric size"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <span className="w-9 text-center font-mono text-[10px] tabular-nums text-mist/55">
                    {zoom}%
                  </span>
                  <div className="hidden items-center gap-0.5 pl-1 xl:flex">
                    {ZOOM_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setZoom(preset.value)}
                        className={cn(
                          'rounded px-1.5 py-0.5 font-mono text-[9px] transition',
                          Math.abs(zoom - preset.value) <= 3
                            ? 'bg-lavender/20 text-lavender font-semibold'
                            : 'text-mist/45 hover:text-white'
                        )}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {payload && payload.synced && (
            <Timeline
              lines={payload.lines}
              activeIndex={activeIndex}
              progress={progress}
              currentTime={currentTime}
              totalDuration={totalDuration}
              onSeek={seekTo}
            />
          )}

          {payload && !payload.synced && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="flex items-center gap-1.5 uppercase tracking-[0.14em] text-mist/45">
                  <AlignLeft className="h-3 w-3" />
                  Plain lyric sheet
                </span>
                <span className="font-mono tabular-nums text-mist/45">
                  {formatStamp(currentTime)} / {formatStamp(totalDuration)}
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-lavender to-sage transition-[width] duration-500"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] text-mist/40">
                This provider returned text only — or import a timestamped <code className="text-lavender">.lrc</code> file above to sync lines.
              </p>
            </div>
          )}

          {viz === 'wave' && canShowSynced && <WaveStrip playing={isPlaying && status === 'ready'} />}

          <div className="relative">
            {loading && !payload ? (
              <LyricsSkeleton />
            ) : error && !payload ? (
              error.code === 'NO_LYRICS' ? (
                <EmptyState
                  icon={<ScanText className="h-6 w-6" />}
                  title="No lyrics found online for this track"
                  message={`${error.message} You can also import your own .lrc file or paste lyrics directly.`}
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button type="button" onClick={() => lrcFileInputRef.current?.click()}>
                        <Upload className="h-4 w-4" />
                        Import .LRC file
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setLrcDraft('');
                          setShowLrcModal(true);
                        }}
                      >
                        <FileText className="h-4 w-4" />
                        Paste Lyrics / LRC
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void load(true)}
                        disabled={loading}
                      >
                        <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                        Retry lookup
                      </Button>
                    </div>
                  }
                />
              ) : (
                <ErrorState
                  title="The lyrics providers did not answer"
                  message={error.message}
                  attempts={error.attempts}
                  onRetry={() => void load(true)}
                />
              )
            ) : payload?.instrumental ? (
              <EmptyState
                icon={<AudioLines className="h-6 w-6" />}
                title="Instrumental track"
                message={`${sourceLabel(payload)} marks this recording as instrumental. There are no lyric lines to sync.`}
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button type="button" variant="outline" onClick={() => void load(true)}>
                      <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                      Check again
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => lrcFileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" />
                      Import custom .LRC
                    </Button>
                  </div>
                }
              />
            ) : payload && effectiveMode === 'plain' && payload.plain ? (
              <div className="relative max-h-[52vh] overflow-y-auto scroll-smooth rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-white/[0.015] scrollbar-thin sm:max-h-[600px] lg:max-h-[640px]">
                <div
                  className="whitespace-pre-wrap px-5 py-6 font-medium leading-[2.05] tracking-tight text-mist/85 sm:px-8 sm:py-8"
                  style={{ fontSize: `${(zoom / 100) * 16}px` }}
                >
                  {payload.plain}
                </div>
              </div>
            ) : payload && effectiveMode === 'synced' && payload.lines.length && viz === 'ambient' ? (
              <AmbientStage
                lines={payload.lines}
                activeIndex={activeIndex}
                lineProgress={lineProgress}
                artwork={artwork}
                zoom={zoom}
                onSeek={(time) => seekTo(time)}
              />
            ) : payload && effectiveMode === 'synced' && payload.lines.length ? (
              <div
                ref={scrollRef}
                onWheel={() => {
                  userScrollAt.current = Date.now();
                }}
                onTouchMove={() => {
                  userScrollAt.current = Date.now();
                }}
                className="relative max-h-[52vh] overflow-y-auto scroll-smooth rounded-2xl border border-white/[0.07] bg-gradient-to-b from-[#0d0d13]/90 via-black/20 to-[#0a0a0f]/90 px-2 py-3 scrollbar-thin sm:max-h-[600px] lg:max-h-[640px]"
                style={{ fontSize: `${(zoom / 100) * 16}px` }}
                aria-label="Synced lyrics"
              >
                <div className="pointer-events-none sticky top-0 z-10 -mt-3 h-10 bg-gradient-to-b from-[#0c0c11] to-transparent" />

                <div className="space-y-0.5 pb-2 pt-1">
                  {payload.lines.map((line, index) => {
                    const active = index === activeIndex;
                    const past = activeIndex >= 0 && index < activeIndex;
                    return (
                      <button
                        key={`${line.time}-${index}`}
                        ref={(node) => {
                          if (node) lineRefs.current.set(index, node);
                          else lineRefs.current.delete(index);
                        }}
                        type="button"
                        onClick={() => seekTo(line.time)}
                        className={cn(
                          'group relative flex w-full items-start gap-2 rounded-2xl px-2 py-2 text-left transition-all duration-300 sm:gap-4 sm:px-4',
                          active
                            ? 'my-1 bg-white/[0.065] shadow-[0_18px_50px_-30px_rgba(196,181,253,0.8)] ring-1 ring-inset ring-lavender/15'
                            : past
                              ? 'opacity-35 hover:bg-white/[0.035] hover:opacity-75'
                              : 'opacity-75 hover:bg-white/[0.035] hover:opacity-100'
                        )}
                        aria-current={active ? 'true' : undefined}
                        aria-label={`Seek to ${line.text} at ${formatStamp(line.time)}`}
                      >
                        {active && (
                          <span className="pointer-events-none absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-lavender shadow-[0_0_14px_rgba(196,181,253,0.75)]" />
                        )}
                        {viz !== 'karaoke' && (
                          <span
                            className={cn(
                              'w-9 shrink-0 pt-0.5 font-mono text-[0.65em] tabular-nums transition-colors sm:w-11',
                              active ? 'font-bold text-lavender' : 'text-mist/35 group-hover:text-lavender/70'
                            )}
                          >
                            {formatStamp(line.time)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block font-medium tracking-tight transition-colors',
                              active
                                ? cn(
                                    'font-semibold leading-tight text-white drop-shadow-[0_0_18px_rgba(196,181,253,0.35)]',
                                    viz === 'karaoke'
                                      ? 'text-[1.9em] sm:text-[2.2em]'
                                      : 'text-[1.4em] sm:text-[1.55em]'
                                  )
                                : cn(
                                    'text-[0.95em] leading-relaxed text-mist/85',
                                    viz === 'karaoke' && 'text-[1.1em] blur-[0.6px]'
                                  )
                            )}
                          >
                            {active ? <KaraokeText text={line.text} progress={lineProgress} /> : line.text}
                          </span>
                        </span>
                        {active && (
                          <span className="mt-1 hidden shrink-0 items-center gap-1 rounded-full bg-lavender/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-lavender sm:flex">
                            <span className="h-1 w-1 animate-ping rounded-full bg-lavender" />
                            now
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pointer-events-none sticky bottom-0 z-10 -mb-3 h-10 bg-gradient-to-t from-[#08080b] to-transparent" />
              </div>
            ) : (
              <LyricsSkeleton />
            )}
          </div>

          <p className="flex items-center gap-2 px-1 text-[10px] text-mist/35">
            <Sparkles className="h-3 w-3 shrink-0 text-lavender/50" />
            Lines and timestamps come from LRCLIB, lyrics.ovh, or your own imported .lrc file.
          </p>
        </div>
      </div>

      {showLrcModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Import or edit LRC lyrics"
        >
          <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-ink-900 p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-white">
                  Attach Custom .LRC or Plain Lyrics
                </h3>
                <p className="text-xs text-mist/60">
                  For “{track.title}” — supports standard <code className="text-lavender">[mm:ss.xx]</code> LRC timestamps
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLrcModal(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-mist/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={lrcDraft}
              onChange={(e) => setLrcDraft(e.target.value)}
              rows={9}
              placeholder={`[00:12.40] First line of the song\n[00:18.10] Second line of the song\n...\n(or paste plain text lyrics without timestamps)`}
              className="mt-4 w-full rounded-2xl border border-white/10 bg-black/40 p-3.5 font-mono text-xs leading-relaxed text-white outline-none focus:border-lavender/50"
            />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => lrcFileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                Load from .lrc file
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLrcModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const saved = saveCustomLyricsText(track, lrcDraft);
                    if (saved) {
                      setPayload(saved);
                      setError(null);
                      setShowLrcModal(false);
                    }
                  }}
                >
                  Save lyrics
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrustLine({
  payload,
  loading,
  realCodecLabel,
  tuningHz,
  onChangeTuning,
  onImportLrc,
  onOpenPasteLrc
}: {
  payload?: LyricsPayload | null;
  loading?: boolean;
  realCodecLabel: string;
  tuningHz: TuningHz;
  onChangeTuning: (hz: TuningHz) => void;
  onImportLrc?: () => void;
  onOpenPasteLrc?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-mist/70">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-lavender/15 px-2.5 py-0.5 font-medium text-lavender">
          <span className="h-1.5 w-1.5 rounded-full bg-lavender" />
          {realCodecLabel}
        </span>
        <span className="text-mist/30">•</span>
        <div className="inline-flex items-center gap-1 rounded-full bg-black/30 p-0.5">
          {([440, 432, 528] as const).map((hz) => (
            <button
              key={hz}
              type="button"
              onClick={() => onChangeTuning(hz)}
              title={
                hz === 432
                  ? 'Real 432Hz harmonic pitch shift (-31.8 cents)'
                  : hz === 528
                    ? 'Real 528Hz harmonic pitch shift'
                    : 'Standard 440Hz concert pitch'
              }
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium transition',
                tuningHz === hz
                  ? 'bg-sage/20 text-sage font-semibold'
                  : 'text-mist/50 hover:text-white'
              )}
            >
              {hz}Hz
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {onImportLrc && (
          <button
            type="button"
            onClick={onImportLrc}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-white/80 hover:bg-white/[0.08]"
          >
            <Upload className="h-3 w-3 text-lavender" />
            .LRC
          </button>
        )}
        {onOpenPasteLrc && (
          <button
            type="button"
            onClick={onOpenPasteLrc}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-white/80 hover:bg-white/[0.08]"
          >
            <FileText className="h-3 w-3 text-sage" />
            Edit
          </button>
        )}
        <Badge variant="outline">
          <Clock3 className="h-3 w-3" />
          line-accurate seek
        </Badge>
        {payload?.synced ? (
          <Badge variant="sage">{payload.lines.length} timed lines</Badge>
        ) : loading ? (
          <Badge variant="muted">fetching</Badge>
        ) : payload?.plain ? (
          <Badge variant="muted">plain text</Badge>
        ) : null}
      </div>
    </div>
  );
}

function QuoteCard({
  payload,
  loading,
  error,
  mode,
  focusLine,
  activeIndex,
  plainPreview,
  copied,
  onSeek,
  onCopy
}: {
  payload: LyricsPayload | null;
  loading: boolean;
  error: LyricsError | null;
  mode: 'synced' | 'plain';
  focusLine?: LyricLine;
  activeIndex: number;
  plainPreview: string | null;
  copied: boolean;
  onSeek: () => void;
  onCopy: (text: string) => void;
}) {
  const hasSynced = !!(payload?.synced && focusLine && mode === 'synced');
  const isActive = activeIndex >= 0;
  const quoteText = hasSynced ? focusLine?.text : plainPreview;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.065] via-white/[0.035] to-transparent p-4 shadow-[0_24px_60px_-45px_rgba(196,181,253,0.55)] sm:p-5">
      <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-lavender/10 blur-2xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-mist/45">
          <span className="flex items-center gap-2">
            <Quote className="h-3.5 w-3.5 text-lavender" />
            {hasSynced
              ? isActive
                ? 'Aura Quote · Line in focus'
                : 'Up next'
              : mode === 'plain'
                ? 'From the lyric sheet'
                : 'Line in focus'}
          </span>
          {quoteText && (
            <button
              type="button"
              onClick={() => onCopy(quoteText)}
              className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-medium text-lavender transition hover:bg-white/[0.12]"
            >
              {copied ? <Check className="h-2.5 w-2.5 text-sage" /> : <Copy className="h-2.5 w-2.5" />}
              {copied ? 'Copied' : 'Copy quote'}
            </button>
          )}
        </div>

        {hasSynced && focusLine ? (
          <>
            <p className="mt-3 text-[15px] font-medium italic leading-relaxed text-white/90">
              “{focusLine.text}”
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[10px] tabular-nums text-mist/45">
                {isActive ? 'now' : 'at'} {formatStamp(focusLine.time)}
              </span>
              <button
                type="button"
                onClick={onSeek}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium text-lavender transition hover:bg-lavender/10"
              >
                <RotateCw className="h-3 w-3" />
                {isActive ? 'Replay this line' : 'Jump to this line'}
              </button>
            </div>
          </>
        ) : payload?.instrumental ? (
          <p className="mt-3 text-sm leading-relaxed text-mist/65">
            This track is marked as instrumental, so there is no lyric line to focus.
          </p>
        ) : plainPreview && mode === 'plain' ? (
          <>
            <p className="mt-3 text-[15px] font-medium italic leading-relaxed text-white/90">
              “{plainPreview}”
            </p>
            <p className="mt-4 text-[10px] text-mist/40">
              Plain lyrics have no timestamps, so this line cannot be synced to the audio.
            </p>
          </>
        ) : loading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-4/5 rounded-full" />
            <Skeleton className="h-4 w-3/5 rounded-full" />
            <Skeleton className="h-3 w-24 rounded-full" />
          </div>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-mist/55">
            {error
              ? 'No lyric line is available for this track right now.'
              : 'Play the track to bring its first lyric line into focus.'}
          </p>
        )}
      </div>
    </div>
  );
}

function ProvenanceCard({
  payload,
  loading,
  error,
  hasCustomLyrics,
  onClearCustomLyrics
}: {
  payload: LyricsPayload | null;
  loading: boolean;
  error: LyricsError | null;
  hasCustomLyrics: boolean;
  onClearCustomLyrics: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-mist/45">
          <Database className="h-3 w-3 text-sage/80" />
          Lyric source
        </span>
        <div className="flex items-center gap-1.5">
          <Badge variant={payload ? 'outline' : 'muted'}>
            {payload ? sourceLabel(payload) : loading ? 'looking up' : 'none'}
          </Badge>
          {hasCustomLyrics && (
            <button
              type="button"
              onClick={onClearCustomLyrics}
              className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] text-mist/70 hover:text-rose-300"
              title="Remove custom imported LRC and revert to online lookup"
            >
              Reset custom
            </button>
          )}
        </div>
      </div>

      {payload ? (
        <>
          <p
            className="mt-2 truncate text-[11px] text-mist/60"
            title={`${payload.trackName} — ${payload.artistName}`}
          >
            {payload.trackName} <span className="text-mist/35">—</span> {payload.artistName}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-mist/40">
            <span className="rounded-full bg-white/[0.04] px-2 py-0.5">
              {payload.synced ? 'timestamped LRC' : 'plain text'}
            </span>
            {payload.duration ? (
              <span className="rounded-full bg-white/[0.04] px-2 py-0.5 font-mono tabular-nums">
                {formatStamp(payload.duration)}
              </span>
            ) : null}
            {payload.instrumental ? (
              <span className="rounded-full bg-white/[0.04] px-2 py-0.5">instrumental</span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-mist/50">
          {error
            ? 'The lookup did not return a lyric sheet for this recording. Use Import .LRC above to attach your own.'
            : loading
              ? 'Asking LRCLIB for a matching lyric sheet…'
              : 'Waiting for a track to be played.'}
        </p>
      )}
    </div>
  );
}

function Timeline({
  lines,
  activeIndex,
  progress,
  currentTime,
  totalDuration,
  onSeek
}: {
  lines: LyricLine[];
  activeIndex: number;
  progress: number;
  currentTime: number;
  totalDuration: number;
  onSeek: (time: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
        <span className="flex items-center gap-1.5 uppercase tracking-[0.14em] text-mist/45">
          <AudioLines className="h-3 w-3 text-lavender" />
          Lyric timeline · {lines.length} markers
        </span>
        <span className="font-mono tabular-nums text-mist/45">
          {formatStamp(currentTime)} / {formatStamp(totalDuration)}
        </span>
      </div>

      <div className="relative mt-3 h-12">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
        <div
          className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-gradient-to-r from-lavender/80 to-sage/70 transition-[width] duration-500"
          style={{ width: `${progress * 100}%` }}
        />

        {lines.map((line, index) => {
          const left = clamp((line.time / totalDuration) * 100, 0, 100);
          const active = index === activeIndex;
          const past = activeIndex >= 0 && index < activeIndex;
          return (
            <button
              key={`${line.time}-marker-${index}`}
              type="button"
              onClick={() => onSeek(line.time)}
              title={`${formatStamp(line.time)} — ${line.text}`}
              aria-label={`Seek to line at ${formatStamp(line.time)}: ${line.text}`}
              className={cn(
                'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all',
                active
                  ? 'h-5 w-[3px] bg-lavender shadow-[0_0_10px_rgba(196,181,253,0.9)]'
                  : past
                    ? 'h-2 w-[2px] bg-lavender/45'
                    : 'h-2 w-[2px] bg-white/20 hover:h-3 hover:bg-lavender/70'
              )}
              style={{ left: `${left}%` }}
            />
          );
        })}

        <span
          className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-lavender/50 bg-ink-950 shadow-[0_0_12px_rgba(196,181,253,0.55)]"
          style={{ left: `${progress * 100}%` }}
        />
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-mist/35">
        <span>Every marker is a real LRC timestamp</span>
        <span className="hidden sm:inline">Click a marker to seek</span>
      </div>
    </div>
  );
}

function LyricsSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 sm:p-7">
      <div className="mb-5 flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-4 w-40 rounded-full" />
      </div>
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="flex items-start gap-4">
          <Skeleton className="mt-1 h-3 w-9 shrink-0 rounded-full" />
          <Skeleton
            className={cn(
              'h-4 rounded-full',
              index === 2
                ? 'h-7 w-4/5'
                : index % 3 === 0
                  ? 'w-3/4'
                  : index % 3 === 1
                    ? 'w-5/6'
                    : 'w-2/3'
            )}
          />
        </div>
      ))}
    </div>
  );
}

function VizTabs({
  value,
  onChange,
  timedAvailable
}: {
  value: Viz;
  onChange: (viz: Viz) => void;
  timedAvailable: boolean;
}) {
  return (
    <div className="no-scrollbar -mx-1 flex overflow-x-auto px-1">
      <div className="mx-auto flex shrink-0 items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] p-1 backdrop-blur-md">
        {VIZ_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = value === tab.id;
          const disabled = tab.id !== 'synced' && !timedAvailable;
          return (
            <button
              key={tab.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(tab.id)}
              aria-pressed={active}
              title={disabled ? 'Needs time-synced lyrics' : tab.label}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[11px] font-medium transition sm:px-4',
                active ? 'bg-lavender text-ink-950 shadow-glow' : 'text-mist/70 hover:text-white',
                disabled && 'cursor-not-allowed opacity-35 hover:text-mist/70'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KaraokeText({ text, progress }: { text: string; progress: number }) {
  const parts = text.split(/(\s+)/);
  const wordCount = parts.filter((part) => part.trim()).length || 1;
  let seen = 0;

  return (
    <>
      {parts.map((part, index) => {
        if (!part.trim()) return part;
        const position = seen++;
        const fill = clamp(progress * wordCount - position, 0, 1);
        const percent = Math.round(fill * 100);
        return (
          <span
            key={index}
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: `linear-gradient(90deg, #d4c4e5 ${percent}%, rgba(255,255,255,0.92) ${percent}%)`,
              WebkitBackgroundClip: 'text'
            }}
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

const SPECTRUM_BARS = 40;

function barHeight(index: number): number {
  const a = Math.sin(index * 0.9) * 0.5 + 0.5;
  const b = Math.sin(index * 0.37 + 1.4) * 0.5 + 0.5;
  return 0.25 + 0.75 * (a * 0.6 + b * 0.4);
}

function ResonanceSpectrum({
  playing,
  progress,
  local,
  ambientStems,
  onToggleStem
}: {
  playing: boolean;
  progress: number;
  local: boolean;
  ambientStems: Record<AmbientStemId, number>;
  onToggleStem: (id: AmbientStemId, defaultLevel: number) => void;
}) {
  return (
    <div className="rounded-3xl border border-white/[0.07] bg-white/[0.03] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-mist/60">
          <AudioLines className="h-3.5 w-3.5 text-lavender" />
          Resonance spectrum & ambient stems
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-mist/50">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              playing ? 'animate-pulse bg-sage' : 'bg-mist/40'
            )}
          />
          {local ? 'saved copy · offline ready' : playing ? 'live' : 'paused'}
        </span>
      </div>

      <div
        className="mt-4 flex h-20 items-end gap-[3px] rounded-2xl bg-black/25 px-3 pb-3 pt-4"
        aria-hidden="true"
      >
        {Array.from({ length: SPECTRUM_BARS }).map((_, index) => {
          const reached = index / SPECTRUM_BARS <= progress;
          return (
            <span
              key={index}
              className={cn(
                'eq-bar flex-1 rounded-full',
                reached ? 'bg-lavender/80' : 'bg-white/15'
              )}
              style={{
                height: `${Math.round(barHeight(index) * 100)}%`,
                animationDuration: `${0.7 + (index % 7) * 0.13}s`,
                animationDelay: `${(index % 9) * 0.07}s`,
                animationPlayState: playing ? 'running' : 'paused'
              }}
            />
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {QUICK_STEMS.map((stem) => {
          const Icon = stem.icon;
          const level = ambientStems[stem.id] || 0;
          const active = level > 0;
          return (
            <button
              key={stem.id}
              type="button"
              onClick={() => onToggleStem(stem.id, stem.defaultLevel)}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center transition',
                active
                  ? 'border-lavender/40 bg-lavender/15 text-white'
                  : 'border-white/[0.06] bg-black/20 text-mist/60 hover:bg-white/[0.05] hover:text-white'
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', active ? 'text-lavender' : 'text-mist/45')} />
              <span className="text-[10px] font-medium">{stem.label}</span>
              <span className="font-mono text-[9px] text-mist/50">{active ? `${level}%` : 'Off'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WaveStrip({ playing }: { playing: boolean }) {
  return (
    <div
      className="flex h-16 items-center gap-[3px] overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-r from-lavender/10 via-transparent to-sage/10 px-3"
      aria-hidden="true"
    >
      {Array.from({ length: 72 }).map((_, index) => (
        <span
          key={index}
          className="eq-bar h-full flex-1 rounded-full bg-gradient-to-t from-lavender/30 to-lavender/80"
          style={{
            transform: `scaleY(${0.2 + barHeight(index) * 0.8})`,
            animationDuration: `${0.9 + (index % 11) * 0.11}s`,
            animationDelay: `${(index % 13) * 0.06}s`,
            animationPlayState: playing ? 'running' : 'paused'
          }}
        />
      ))}
    </div>
  );
}

function AmbientStage({
  lines,
  activeIndex,
  lineProgress,
  artwork,
  zoom,
  onSeek
}: {
  lines: LyricLine[];
  activeIndex: number;
  lineProgress: number;
  artwork: string;
  zoom: number;
  onSeek: (time: number) => void;
}) {
  const index = Math.max(activeIndex, 0);
  const prev = lines[index - 1];
  const current = lines[index];
  const next = lines[index + 1];
  const after = lines[index + 2];
  const scale = zoom / 100;

  return (
    <div className="relative flex min-h-[52vh] flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/[0.07] px-6 py-10 text-center sm:min-h-[560px]">
      {artwork && (
        <img
          src={artwork}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-3xl"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950/80 via-ink-950/55 to-ink-950/90" />

      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-5" aria-live="polite">
        <button
          type="button"
          onClick={() => prev && onSeek(prev.time)}
          className="max-w-full text-base text-white/25 transition hover:text-white/50"
          style={{ fontSize: `${scale * 16}px` }}
        >
          {prev?.text ?? '\u00a0'}
        </button>
        <p
          key={index}
          className="animate-fade-up font-semibold leading-[1.15] tracking-tight text-white"
          style={{ fontSize: `${scale * 38}px` }}
        >
          {current ? <KaraokeText text={current.text} progress={lineProgress} /> : '♪'}
        </p>
        <button
          type="button"
          onClick={() => next && onSeek(next.time)}
          className="max-w-full text-lg text-white/40 transition hover:text-white/70"
          style={{ fontSize: `${scale * 20}px` }}
        >
          {next?.text ?? '\u00a0'}
        </button>
        <button
          type="button"
          onClick={() => after && onSeek(after.time)}
          className="max-w-full text-white/20 transition hover:text-white/45"
          style={{ fontSize: `${scale * 16}px` }}
        >
          {after?.text ?? '\u00a0'}
        </button>
      </div>
    </div>
  );
}
