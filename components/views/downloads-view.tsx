'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  AudioLines,
  Check,
  CloudRain,
  Disc3,
  FileAudio,
  FileText,
  Flame,
  FolderOpen,
  HardDrive,
  Heart,
  Play,
  Shuffle,
  Sliders,
  Trash2,
  Upload,
  Wind,
  X
} from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { TrackGrid } from '@/components/track-grid';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useHydrated } from '@/hooks/use-hydrated';
import { isNative, type AmbientStemId, type TuningHz } from '@/lib/native/platform';
import { formatBytes, useDownloadsStore, useOfflineStore } from '@/lib/store/downloads-store';
import { useLibraryStore } from '@/lib/store/library-store';
import { useIsOffline } from '@/lib/store/network-store';
import { usePlayerStore, useCurrentTrack } from '@/lib/store/player-store';
import { useSettingsStore } from '@/lib/store/settings-store';
import { cn, formatDuration } from '@/lib/utils';

export interface DownloadsViewProps {
  scrollParent?: HTMLElement | null;
  onExplore: () => void;
}

const STEMS: Array<{
  id: AmbientStemId;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'rain', label: 'Soft Rain', hint: 'Filtered pink rain noise', icon: CloudRain },
  { id: 'vinyl', label: 'Vinyl Crackle', hint: 'Warm analog dust & hiss', icon: Disc3 },
  { id: 'fire', label: 'Fireplace', hint: 'Gentle hearth crackle', icon: Flame },
  { id: 'wind', label: 'Night Wind', hint: 'Low pine breeze', icon: Wind }
];

const TUNINGS: Array<{ hz: TuningHz; label: string; desc: string }> = [
  { hz: 440, label: '440Hz', desc: 'Standard pitch' },
  { hz: 432, label: '432Hz', desc: 'Warm (-31.8¢)' },
  { hz: 528, label: '528Hz', desc: 'Bright (+15.6¢)' }
];

export function DownloadsView({ scrollParent, onExplore }: DownloadsViewProps) {
  const hydrated = useHydrated();
  const offline = useIsOffline();
  const currentTrack = useCurrentTrack();

  // Native downloads store
  const meta = useDownloadsStore((state) => state.meta);
  const files = useDownloadsStore((state) => state.files);
  const progress = useDownloadsStore((state) => state.progress);
  const downloadMany = useDownloadsStore((state) => state.downloadMany);
  const cancel = useDownloadsStore((state) => state.cancel);
  const removeAllDownloads = useDownloadsStore((state) => state.removeAll);

  // Imported local files + LRC vault store
  const localTracks = useOfflineStore((state) => state.localTracks);
  const localBytes = useOfflineStore((state) => state.localBytes);
  const customLyrics = useOfflineStore((state) => state.customLyrics);
  const importing = useOfflineStore((state) => state.importing);
  const lastImportMessage = useOfflineStore((state) => state.lastImportMessage);
  const importFiles = useOfflineStore((state) => state.importFiles);
  const removeLocalTrack = useOfflineStore((state) => state.removeLocalTrack);
  const clearLocalTracks = useOfflineStore((state) => state.clearLocalTracks);

  const favorites = useLibraryStore((state) => state.favorites);
  const playQueue = usePlayerStore((state) => state.playQueue);
  const playTrack = usePlayerStore((state) => state.playTrack);

  // Real DSP tuning + ambient stems
  const tuningHz = useSettingsStore((state) => state.tuningHz);
  const setTuningHz = useSettingsStore((state) => state.setTuningHz);
  const ambientStems = useSettingsStore((state) => state.ambientStems);
  const setAmbientStem = useSettingsStore((state) => state.setAmbientStem);
  const resetAmbientStems = useSettingsStore((state) => state.resetAmbientStems);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lrcInputRef = useRef<HTMLInputElement | null>(null);
  const [draggingOver, setDraggingOver] = useState(false);

  const savedDownloads = useMemo(
    () =>
      Object.values(meta)
        .filter((item) => !!files[item.track.videoId])
        .sort((a, b) => b.downloadedAt - a.downloadedAt),
    [meta, files]
  );

  const downloadedTrackList = useMemo(
    () => savedDownloads.map((item) => item.track),
    [savedDownloads]
  );

  const allOfflineTracks = useMemo(() => {
    const seen = new Set<string>();
    const combined = [...localTracks, ...downloadedTrackList];
    return combined.filter((t) => {
      if (seen.has(t.videoId)) return false;
      seen.add(t.videoId);
      return true;
    });
  }, [localTracks, downloadedTrackList]);

  const totalDownloadBytes = savedDownloads.reduce((sum, item) => sum + (item.bytes || 0), 0);
  const totalLocalBytes = Object.values(localBytes).reduce((sum, b) => sum + (b || 0), 0);
  const totalBytes = totalDownloadBytes + totalLocalBytes;

  const activeDownloads = Object.entries(progress).filter(([, value]) => value.phase !== 'error');
  const failedDownloads = Object.entries(progress).filter(([, value]) => value.phase === 'error');
  const missingFavorites = favorites.filter(
    (track) => !files[track.videoId] && !track.isLocalFile && track.source !== 'local'
  );

  if (!hydrated) return <div className="h-40 animate-pulse rounded-3xl bg-white/[0.03]" />;

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    const result = await importFiles(fileList, currentTrack);
    if (result.firstTrack) {
      playTrack(result.firstTrack, [...localTracks, result.firstTrack]);
    }
  };

  return (
    <div
      className="space-y-6"
      onDragOver={(e) => {
        e.preventDefault();
        setDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDraggingOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDraggingOver(false);
        void handleFilesSelected(e.dataTransfer?.files ?? null);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".mp3,.flac,.wav,.m4a,.ogg,.aac,.opus,.lrc,.txt,audio/*"
        className="hidden"
        onChange={(e) => {
          void handleFilesSelected(e.target.files);
          e.currentTarget.value = '';
        }}
      />
      <input
        ref={lrcInputRef}
        type="file"
        multiple
        accept=".lrc,.txt"
        className="hidden"
        onChange={(e) => {
          void handleFilesSelected(e.target.files);
          e.currentTarget.value = '';
        }}
      />

      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-sage/10 blur-3xl" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-mist/45">
                offline vault & downloads
              </p>
              <Badge variant="sage">plays without internet</Badge>
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Offline & Local Library
            </h2>
            <p className="mt-1.5 max-w-xl text-sm text-mist/60">
              Import your own <code className="text-lavender">.mp3</code>,{' '}
              <code className="text-lavender">.flac</code>, <code className="text-lavender">.wav</code>,{' '}
              <code className="text-lavender">.m4a</code>, and synced{' '}
              <code className="text-sage">.lrc</code> lyric files, or download online tracks straight to
              this device.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-mist/50">
              <span className="inline-flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-sage" />
                {formatBytes(totalBytes)} stored
              </span>
              <span>•</span>
              <span>
                {localTracks.length} imported file{localTracks.length === 1 ? '' : 's'}
              </span>
              <span>•</span>
              <span>
                {downloadedTrackList.length} downloaded track{downloadedTrackList.length === 1 ? '' : 's'}
              </span>
              <span>•</span>
              <span>
                {Object.keys(customLyrics).length} custom LRC file
                {Object.keys(customLyrics).length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <FolderOpen className="h-4 w-4" />
              {importing ? 'Importing…' : 'Import Audio / .LRC'}
            </Button>
            {allOfflineTracks.length > 0 && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => playQueue(allOfflineTracks, 0)}
                >
                  <Play className="h-4 w-4" fill="currentColor" />
                  Play all ({allOfflineTracks.length})
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    playQueue([...allOfflineTracks].sort(() => Math.random() - 0.5), 0)
                  }
                >
                  <Shuffle className="h-4 w-4" />
                  Shuffle
                </Button>
              </>
            )}
          </div>
        </div>

        {lastImportMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-sage/25 bg-sage/10 px-3.5 py-2 text-xs text-sage">
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span>{lastImportMessage}</span>
          </div>
        )}

        {missingFavorites.length > 0 && isNative() && !offline && (
          <button
            type="button"
            onClick={() => void downloadMany(missingFavorites)}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-lavender/25 bg-lavender/10 px-4 py-2 text-[12px] font-medium text-lavender transition hover:bg-lavender/15"
          >
            <Heart className="h-3.5 w-3.5" />
            Download {missingFavorites.length} favorite{missingFavorites.length === 1 ? '' : 's'} for offline
          </button>
        )}
      </section>

      <section
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'cursor-pointer rounded-3xl border-2 border-dashed p-5 transition sm:p-6',
          draggingOver
            ? 'border-lavender bg-lavender/10'
            : 'border-white/[0.1] bg-white/[0.02] hover:border-lavender/40 hover:bg-white/[0.035]'
        )}
      >
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-lavender/25 bg-lavender/10 text-lavender">
              <Upload className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Drag & drop local music (.mp3, .flac, .wav, .m4a, .ogg) or synced lyrics (.lrc)
              </h3>
              <p className="mt-0.5 text-xs text-mist/60">
                Tip: Select <code className="text-lavender">Song.mp3</code> and{' '}
                <code className="text-sage">Song.lrc</code> together to automatically pair synced lyrics
                with your local track.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              <FileAudio className="h-3.5 w-3.5" />
              Browse Audio
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                lrcInputRef.current?.click();
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              Import .LRC
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-sage">
              <Sliders className="h-3.5 w-3.5" />
              Real Web Audio Synthesis · Works Offline
            </span>
            <h3 className="mt-1 text-base font-semibold text-white">
              Sanctuary Ambient Stems & Pitch Tuning
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-1">
              {TUNINGS.map((t) => (
                <button
                  key={t.hz}
                  type="button"
                  onClick={() => setTuningHz(t.hz)}
                  title={t.desc}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium transition',
                    tuningHz === t.hz
                      ? 'bg-lavender text-ink-950 font-semibold'
                      : 'text-mist/65 hover:text-white'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={resetAmbientStems}>
              Mute stems
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEMS.map((stem) => {
            const Icon = stem.icon;
            const val = ambientStems[stem.id] || 0;
            return (
              <div
                key={stem.id}
                className={cn(
                  'rounded-2xl border p-3.5 transition',
                  val > 0
                    ? 'border-lavender/35 bg-lavender/[0.07]'
                    : 'border-white/[0.07] bg-black/25'
                )}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-medium text-white">
                    <Icon className={cn('h-4 w-4', val > 0 ? 'text-lavender' : 'text-mist/50')} />
                    {stem.label}
                  </span>
                  <span className="font-mono text-[11px] text-lavender">{val}%</span>
                </div>
                <p className="mt-0.5 text-[10px] text-mist/45">{stem.hint}</p>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={val}
                  onChange={(e) => setAmbientStem(stem.id, Number(e.target.value))}
                  className="mt-2.5 h-1.5 w-full cursor-pointer accent-lavender"
                  aria-label={`${stem.label} volume`}
                />
              </div>
            );
          })}
        </div>
      </section>

      {(activeDownloads.length > 0 || failedDownloads.length > 0) && (
        <section className="space-y-2">
          <h3 className="px-1 text-[11px] font-medium uppercase tracking-[0.18em] text-mist/50">
            Downloads in progress
          </h3>
          {activeDownloads.map(([id, value]) => {
            const title =
              meta[id]?.track.title ?? favorites.find((f) => f.videoId === id)?.title ?? id;
            const percent = value.total > 0 ? Math.round((value.received / value.total) * 100) : null;
            return (
              <div
                key={id}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3"
              >
                <ArrowDownToLine className="h-4 w-4 shrink-0 text-lavender" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-white/90">{title}</p>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-lavender transition-all"
                      style={{ width: `${percent ?? 8}%` }}
                    />
                  </div>
                </div>
                <span className="w-10 text-right text-[11px] tabular-nums text-mist/60">
                  {percent !== null ? `${percent}%` : '…'}
                </span>
                <button
                  type="button"
                  onClick={() => void cancel(id)}
                  className="grid h-7 w-7 place-items-center rounded-full text-mist/60 hover:bg-white/10 hover:text-white"
                  aria-label="Cancel download"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {failedDownloads.map(([id, value]) => (
            <div
              key={id}
              className="flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3"
            >
              <p className="min-w-0 flex-1 truncate text-[12px] text-amber-100">
                {value.error ?? 'Download failed'}
              </p>
              <button
                type="button"
                onClick={() => void cancel(id)}
                className="grid h-7 w-7 place-items-center rounded-full text-amber-100/70 hover:bg-white/10"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </section>
      )}

      {localTracks.length > 0 && (
        <section className="space-y-3 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-white">
                Imported Local Audio Files ({localTracks.length})
              </h3>
              <p className="text-xs text-mist/55">
                Stored in your on-device vault with ID3 metadata and paired .LRC lyrics
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.confirm('Remove all imported local files from the vault?')) {
                  void clearLocalTracks();
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear imported
            </Button>
          </div>

          <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.06] bg-black/20">
            {localTracks.map((t) => {
              const hasLrc = !!customLyrics[t.videoId];
              const size = localBytes[t.videoId];
              return (
                <div
                  key={t.videoId}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-white/[0.03]"
                >
                  <button
                    type="button"
                    onClick={() => playTrack(t, allOfflineTracks)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                      {t.thumbnail ? (
                        <img src={t.thumbnail} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <AudioLines className="h-4 w-4 text-lavender" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">{t.title}</span>
                      <span className="block truncate text-xs text-mist/55">
                        {t.artist}
                        {size ? ` · ${formatBytes(size)}` : ''}
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-2">
                    {t.fileFormat && <Badge variant="outline">{t.fileFormat}</Badge>}
                    {hasLrc && <Badge variant="sage">LRC Synced</Badge>}
                    <span className="w-11 text-right font-mono text-xs text-mist/50">
                      {formatDuration(t.duration)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeLocalTrack(t.videoId)}
                      className="grid h-8 w-8 place-items-center rounded-full text-mist/50 hover:bg-white/10 hover:text-rose-300"
                      aria-label={`Remove ${t.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {allOfflineTracks.length === 0 ? (
        <EmptyState
          icon={<ArrowDownToLine className="h-6 w-6" />}
          title="No offline or local tracks yet"
          message="Import local .mp3, .flac, .wav, .m4a, or .lrc files above, or tap the download button on any track while online."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button type="button" onClick={() => fileInputRef.current?.click()}>
                <FolderOpen className="h-4 w-4" />
                Import Local Files
              </Button>
              <Button type="button" variant="outline" onClick={onExplore}>
                Browse online music
              </Button>
            </div>
          }
        />
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">
              All Offline-Ready Tracks ({allOfflineTracks.length})
            </h3>
            {downloadedTrackList.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm('Remove every downloaded track from this device?')) {
                    void removeAllDownloads();
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear downloads
              </Button>
            )}
          </div>
          <TrackGrid tracks={allOfflineTracks} scrollParent={scrollParent} />
        </section>
      )}
    </div>
  );
}

export { DownloadsView as OfflineView };
export type { DownloadsViewProps as OfflineViewProps };
