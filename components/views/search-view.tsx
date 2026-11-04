'use client';

import { useEffect, useRef, useState } from 'react';
import { Compass, RefreshCw, Search, Sparkles } from 'lucide-react';
import { ApiClientError, searchTracks } from '@/lib/api/client';
import type { SearchPayload } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { TrackGridSkeleton } from '@/components/loading-skeletons';
import { TrackGrid } from '@/components/track-grid';

export interface SearchRequest {
  query: string;
  id: number;
}

interface SearchViewProps {
  request: SearchRequest;
  scrollParent?: HTMLElement | null;
  onExplore: () => void;
}

function hostLabel(instance?: string): string | null {
  if (!instance) return null;
  try {
    return new URL(instance).host;
  } catch {
    return null;
  }
}

export function SearchView({ request, scrollParent, onExplore }: SearchViewProps) {
  const [input, setInput] = useState(request.query);
  const [submitted, setSubmitted] = useState('');
  const [data, setData] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; attempts?: string[] } | null>(null);
  const requestId = useRef(0);
  const lastRequestId = useRef(-1);

  const runSearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const id = requestId.current + 1;
    requestId.current = id;
    setInput(trimmed);
    setSubmitted(trimmed);
    setLoading(true);
    setError(null);

    try {
      const payload = await searchTracks(trimmed);
      if (requestId.current !== id) return;
      setData(payload);
    } catch (caught) {
      if (requestId.current !== id) return;
      setData(null);
      setError({
        message: caught instanceof Error ? caught.message : 'Search failed.',
        attempts: caught instanceof ApiClientError ? caught.attempts : undefined
      });
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  };

  useEffect(() => {
    if (!request.query || request.id === lastRequestId.current) return;
    lastRequestId.current = request.id;
    void runSearch(request.query);
    // runSearch is intentionally scoped to this effect trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <Badge variant="default">
            <Sparkles className="h-3 w-3" />
            live search
          </Badge>
          <span className="text-[10px] text-mist/40">Piped → Invidious → YouTube</span>
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Find anything on YouTube.
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-mist/60">
          Results come straight from the search API. No hardcoded suggestions, no artist lists, no
          pre-baked playlists.
        </p>

        <form
          className="mt-5 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch(input);
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mist/50" />
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Song title, artist, album, or a vibe…"
              className="h-12 w-full rounded-full border border-white/12 bg-black/25 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-mist/45 focus:border-lavender/50 focus:ring-2 focus:ring-lavender/15"
              aria-label="Search query"
              autoFocus
            />
          </div>
          <Button type="submit" size="lg" className="h-12 shrink-0" disabled={loading}>
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-950/30 border-t-ink-950" />
                Searching
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Search
              </>
            )}
          </Button>
        </form>
      </section>

      {loading && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-lavender" />
            <p className="text-xs text-mist/60">
              Resolving “{submitted}” through the instance rotator…
            </p>
          </div>
          <TrackGridSkeleton count={10} />
        </section>
      )}

      {!loading && error && (
        <ErrorState
          title="Search failed"
          message={error.message}
          attempts={error.attempts}
          onRetry={() => void runSearch(submitted || input)}
        />
      )}

      {!loading && !error && data && (
        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-white">
                Results for “{data.query}”
              </h3>
              <p className="mt-1 text-[11px] text-mist/50">
                {data.tracks.length} tracks · {data.fromCache ? (data.provider === 'local' ? 'from your offline library' : 'saved results (offline)') : `via ${data.provider}`}
                {hostLabel(data.instance) ? ` · ${hostLabel(data.instance)}` : ''}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void runSearch(submitted)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh results
            </Button>
          </div>
          {data.tracks.length ? (
            <TrackGrid tracks={data.tracks} scrollParent={scrollParent} />
          ) : (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="No tracks found"
              message="The API returned an empty result set. Try a different spelling, a broader mood, or another artist."
            />
          )}
        </section>
      )}

      {!loading && !error && !data && (
        <EmptyState
          icon={<Compass className="h-6 w-6" />}
          title="Start with a feeling"
          message="Type an artist, a song, a genre, or even an activity. The search goes out to the live APIs every time."
          action={
            <Button type="button" variant="secondary" onClick={onExplore}>
              Browse the live feed
            </Button>
          }
        />
      )}
    </div>
  );
}
