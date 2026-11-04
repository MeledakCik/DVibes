'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Disc3,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Waves
} from 'lucide-react';
import { discoverTracks } from '@/lib/api/client';
import { ApiClientError } from '@/lib/api/client';
import type { SearchPayload } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/error-state';
import { EmptyState } from '@/components/empty-state';
import { HomeSkeleton } from '@/components/loading-skeletons';
import { TrackGrid } from '@/components/track-grid';
import { formatViews } from '@/lib/utils';

const MOODS = [
  { label: 'Lo-fi', query: 'lofi beats' },
  { label: 'Jazz', query: 'jazz music' },
  { label: 'Synthwave', query: 'synthwave' },
  { label: 'R&B', query: 'r&b music' },
  { label: 'Focus', query: 'deep focus music' },
  { label: 'Indie', query: 'indie music' }
];

interface HomeViewProps {
  onSearch: (query: string) => void;
  scrollParent?: HTMLElement | null;
}

function hostLabel(instance?: string): string {
  if (!instance) return 'live API';
  try {
    return new URL(instance).host;
  } catch {
    return 'live API';
  }
}

export function HomeView({ onSearch, scrollParent }: HomeViewProps) {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ message: string; attempts?: string[] } | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const id = requestId.current + 1;
    requestId.current = id;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const payload = await discoverTracks();
      if (requestId.current !== id) return;
      setData(payload);
    } catch (caught) {
      if (requestId.current !== id) return;
      setError({
        message: caught instanceof Error ? caught.message : 'Discovery is unavailable right now.',
        attempts: caught instanceof ApiClientError ? caught.attempts : undefined
      });
    } finally {
      if (requestId.current === id) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  const topArtist = useMemo(() => {
    if (!data?.tracks.length) return null;
    const counts = new Map<string, number>();
    for (const track of data.tracks) {
      counts.set(track.artist, (counts.get(track.artist) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [data]);

  const totalViews = useMemo(
    () => data?.tracks.reduce((sum, track) => sum + (track.views || 0), 0) ?? 0,
    [data]
  );

  if (loading && !data) return <HomeSkeleton />;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[linear-gradient(120deg,rgba(28,24,44,0.96),rgba(12,12,17,0.94)_58%,rgba(12,30,29,0.9))] p-5 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] sm:p-7 md:p-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 animate-pulse-slow rounded-full bg-lavender/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-sage/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="sage">
              <Radio className="h-3 w-3" />
              live discovery
            </Badge>
            <Badge variant="outline">zero mock data</Badge>
          </div>

          <h2 className="mt-5 max-w-2xl text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl">
            <span className="text-gradient">Midnight,</span>
            <br className="hidden sm:block" /> set to music.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-mist/70 sm:text-[15px]">
            Every track on this screen was fetched seconds ago from the open YouTube APIs. Search
            anything, hit play, and the app resolves a real audio stream through three fallback
            layers.
          </p>

          <form
            className="mt-6 flex max-w-xl flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (query.trim()) onSearch(query.trim());
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mist/50" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try “Nujabes”, “Tame Impala”, or “rainy jazz”…"
                className="h-12 w-full rounded-full border border-white/12 bg-black/25 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-mist/45 focus:border-lavender/50 focus:bg-black/35 focus:ring-2 focus:ring-lavender/15"
                aria-label="Search music"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 shrink-0">
              Find music
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] uppercase tracking-[0.18em] text-mist/40">
              Try a mood
            </span>
            {MOODS.map((mood) => (
              <button
                key={mood.label}
                type="button"
                onClick={() => onSearch(mood.query)}
                className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[11px] text-mist/75 transition hover:border-lavender/25 hover:bg-lavender/10 hover:text-white"
              >
                {mood.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
                Trending music
              </h3>
              <span className="flex items-center gap-1 rounded-full bg-sage/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-sage">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sage" />
                live
              </span>
            </div>
            <p className="mt-1 text-[11px] text-mist/50">
              {data
                ? `${data.tracks.length} tracks · via ${hostLabel(data.instance)} · ${
                    data.provider
                  }`
                : 'Waiting for the first API response'}
              {totalViews > 0 ? ` · ${formatViews(totalViews)} combined` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {topArtist && (
              <span className="hidden text-[10px] text-mist/45 sm:inline">
                <Sparkles className="mr-1 inline h-3 w-3 text-lavender/60" />
                {topArtist} is all over this feed
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load(true)}
              disabled={refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {error && data && (
          <div className="mb-5">
            <ErrorState
              compact
              title="Refresh failed"
              message={error.message}
              attempts={error.attempts}
              onRetry={() => void load(true)}
            />
          </div>
        )}

        {!data && error ? (
          <ErrorState
            title="Could not reach any music API"
            message={error.message}
            attempts={error.attempts}
            onRetry={() => void load()}
          />
        ) : data && data.tracks.length ? (
          <TrackGrid tracks={data.tracks} scrollParent={scrollParent} />
        ) : (
          <EmptyState
            icon={<Waves className="h-6 w-6" />}
            title="The feed is quiet"
            message="The API responded, but no tracks came back. Retry and the instance rotator will try another mirror."
            action={
              <Button type="button" onClick={() => void load()}>
                <RefreshCw className="h-4 w-4" />
                Fetch again
              </Button>
            }
          />
        )}
      </section>

      <section className="grid gap-3 pb-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <Disc3 className="h-4 w-4 text-lavender" />
          <p className="mt-3 text-sm font-medium text-white">Search is the catalog</p>
          <p className="mt-1 text-[11px] leading-relaxed text-mist/55">
            Piped search feeds the grid. The last feed is kept so the app opens offline too.
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <Waves className="h-4 w-4 text-sage" />
          <p className="mt-3 text-sm font-medium text-white">Streams resolve on tap</p>
          <p className="mt-1 text-[11px] leading-relaxed text-mist/55">
            Piped, then Invidious, then YouTube directly from your device. Download to keep it offline.
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <Radio className="h-4 w-4 text-[#fbbf24]" />
          <p className="mt-3 text-sm font-medium text-white">Background ready</p>
          <p className="mt-1 text-[11px] leading-relaxed text-mist/55">
            Native audio plus MediaSession controls for lock screens and headsets.
          </p>
        </div>
      </section>
    </div>
  );
}
