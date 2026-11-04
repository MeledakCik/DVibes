'use client';

import { Clock3, Heart, Play, Search, Shuffle, Trash2 } from 'lucide-react';
import { useLibraryStore } from '@/lib/store/library-store';
import { usePlayerStore } from '@/lib/store/player-store';
import { useHydrated } from '@/hooks/use-hydrated';
import { EmptyState } from '@/components/empty-state';
import { TrackGrid } from '@/components/track-grid';
import { TrackGridSkeleton } from '@/components/loading-skeletons';
import { Button } from '@/components/ui/button';

interface CollectionViewProps {
  kind: 'favorites' | 'recent';
  scrollParent?: HTMLElement | null;
  onExplore: () => void;
  onSearch: () => void;
}

export function CollectionView({ kind, scrollParent, onExplore, onSearch }: CollectionViewProps) {
  const favorites = useLibraryStore((state) => state.favorites);
  const recents = useLibraryStore((state) => state.recents);
  const clearRecents = useLibraryStore((state) => state.clearRecents);
  const playQueue = usePlayerStore((state) => state.playQueue);
  const hydrated = useHydrated();

  const tracks = kind === 'favorites' ? favorites : recents;
  const title = kind === 'favorites' ? 'Favorites' : 'Recently played';
  const description =
    kind === 'favorites'
      ? 'Tracks you saved while browsing. They stay on this device.'
      : 'A local history of what you actually played. Up to 60 tracks.';

  if (!hydrated) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-pulse rounded-2xl bg-white/[0.03]" />
        <TrackGridSkeleton count={8} />
      </div>
    );
  }

  if (!tracks.length) {
    return (
      <EmptyState
        icon={kind === 'favorites' ? <Heart className="h-6 w-6" /> : <Clock3 className="h-6 w-6" />}
        title={kind === 'favorites' ? 'No favorites yet' : 'Nothing played yet'}
        message={
          kind === 'favorites'
            ? 'Tap the heart on any track. Favorites are stored locally, so they survive a refresh.'
            : 'Play a track and it will appear here. This list is built from your real listening, not from a demo file.'
        }
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" onClick={onExplore}>
              Browse live music
            </Button>
            <Button type="button" variant="outline" onClick={onSearch}>
              <Search className="h-4 w-4" />
              Search something
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-lavender/10 blur-3xl" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-mist/45">
              {kind === 'favorites' ? 'saved locally' : 'listening history'}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {title}
            </h2>
            <p className="mt-1.5 text-sm text-mist/60">{description}</p>
            <p className="mt-3 text-[11px] text-mist/40">
              {tracks.length} track{tracks.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => playQueue(tracks, 0)}>
              <Play className="h-4 w-4" fill="currentColor" />
              Play all
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const shuffled = [...tracks].sort(() => Math.random() - 0.5);
                playQueue(shuffled, 0);
              }}
            >
              <Shuffle className="h-4 w-4" />
              Shuffle
            </Button>
            {kind === 'recent' && (
              <Button type="button" variant="ghost" onClick={clearRecents}>
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </section>

      <TrackGrid tracks={tracks} scrollParent={scrollParent} />
    </div>
  );
}
