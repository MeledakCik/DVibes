'use client';

import { useState } from 'react';
import { Clock3, Heart, ListPlus, Music2, Pause, Play } from 'lucide-react';
import { useLibraryStore } from '@/lib/store/library-store';
import { usePlayerStore } from '@/lib/store/player-store';
import { cn, formatDuration } from '@/lib/utils';
import { useHydrated } from '@/hooks/use-hydrated';
import { useArtwork } from '@/hooks/use-artwork';
import { DownloadButton } from '@/components/download-button';
import { useDownloadsStore } from '@/lib/store/downloads-store';
import { useIsOffline } from '@/lib/store/network-store';
import type { Track } from '@/lib/types';

interface TrackCardProps {
  track: Track;
  queue: Track[];
  index: number;
  priority?: boolean;
}

export function TrackCard({ track, queue, index, priority = false }: TrackCardProps) {
  const playTrack = usePlayerStore((state) => state.playTrack);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const currentTrack = usePlayerStore((state) =>
    state.currentIndex >= 0 ? state.queue[state.currentIndex] : undefined
  );
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const resolving = usePlayerStore((state) => state.status === 'resolving');

  const favorites = useLibraryStore((state) => state.favorites);
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const hydrated = useHydrated();
  const [broken, setBroken] = useState(false);
  const artwork = useArtwork(track);
  const saved = useDownloadsStore((state) => !!state.files[track.videoId]);
  const offline = useIsOffline();
  const unavailable = offline && !saved;

  const isCurrent = currentTrack?.videoId === track.videoId;
  const isFavorite = hydrated && favorites.some((item) => item.videoId === track.videoId);
  const showPlaying = isCurrent && isPlaying;
  const showResolving = isCurrent && resolving;

  return (
    <div
      className={cn('group relative min-w-0 animate-fade-up', unavailable && 'opacity-45')}
      style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
    >
      <button
        type="button"
        onClick={() => playTrack(track, queue)}
        className="block w-full text-left focus-visible:outline-none"
        aria-label={`Play ${track.title} by ${track.artist}`}
      >
        <div
          className={cn(
            'relative aspect-square overflow-hidden rounded-2xl border bg-white/[0.035]',
            isCurrent
              ? 'border-lavender/40 shadow-[0_0_0_1px_rgba(196,181,253,0.14),0_18px_40px_-24px_rgba(196,181,253,0.55)]'
              : 'border-white/[0.07]'
          )}
        >
          {broken || !track.thumbnail ? (
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-lavender/15 via-ink-800 to-sage/10">
              <Music2 className="h-9 w-9 text-white/25" />
            </div>
          ) : (
            <img
              src={artwork}
              alt=""
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              onError={() => setBroken(true)}
              className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]"
            />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/0 to-black/10" />

          <span className="absolute bottom-2.5 left-2.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white/80 backdrop-blur-md">
            {formatDuration(track.duration)}
          </span>

          {showResolving && (
            <span className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[2px]">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-lavender" />
            </span>
          )}

          {!showResolving && (
            <span
              className={cn(
                'absolute bottom-2.5 right-2.5 grid h-10 w-10 place-items-center rounded-full bg-white text-ink-950 shadow-xl transition duration-300',
                'translate-y-1 opacity-100 sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100',
                isCurrent && 'sm:translate-y-0 sm:opacity-100'
              )}
            >
              {showPlaying ? (
                <span className="flex h-4 items-end gap-[2px]">
                  <span className="eq-bar h-3 w-[2px] rounded-full bg-ink-950" />
                  <span className="eq-bar h-4 w-[2px] rounded-full bg-ink-950" />
                  <span className="eq-bar h-2.5 w-[2px] rounded-full bg-ink-950" />
                  <span className="eq-bar h-3.5 w-[2px] rounded-full bg-ink-950" />
                </span>
              ) : isCurrent ? (
                <Pause className="h-4 w-4" fill="currentColor" />
              ) : (
                <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
              )}
            </span>
          )}
        </div>

        <div className="mt-2.5 min-w-0 px-0.5">
          <h3
            className={cn(
              'truncate text-[13px] font-medium leading-snug',
              isCurrent ? 'text-lavender' : 'text-white/90'
            )}
            title={track.title}
          >
            {track.title}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-mist/55" title={track.artist}>
            {track.artist}
          </p>
        </div>
      </button>

      <div className="absolute right-2 top-2 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleFavorite(track);
          }}
          className={cn(
            'grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white/70 backdrop-blur-md transition hover:bg-black/70 hover:text-white',
            isFavorite
              ? 'opacity-100 text-rose-300'
              : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
          )}
          aria-label={isFavorite ? `Remove ${track.title} from favorites` : `Favorite ${track.title}`}
        >
          <Heart className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
        </button>
        <DownloadButton
          track={track}
          className={cn(!saved && 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100')}
        />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            addToQueue(track);
          }}
          className="grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white/70 opacity-100 backdrop-blur-md transition hover:bg-black/70 hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
          aria-label={`Add ${track.title} to queue`}
        >
          <ListPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {showPlaying && (
        <span className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-lavender backdrop-blur-md">
          <Clock3 className="h-2.5 w-2.5" />
          playing
        </span>
      )}
    </div>
  );
}
