'use client';

import { useEffect } from 'react';
import { ListMusic, Trash2, X } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { useCurrentTrack, usePlayerStore } from '@/lib/store/player-store';
import { cn, formatDuration } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function QueuePanel() {
  const open = usePlayerStore((state) => state.queueOpen);
  const setQueueOpen = usePlayerStore((state) => state.setQueueOpen);
  const queue = usePlayerStore((state) => state.queue);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const jumpTo = usePlayerStore((state) => state.jumpTo);
  const removeFromQueue = usePlayerStore((state) => state.removeFromQueue);
  const clearQueue = usePlayerStore((state) => state.clearQueue);
  const currentTrack = useCurrentTrack();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQueueOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setQueueOpen]);

  if (!open) return null;

  const row = (index: number) => {
    const track = queue[index];
    if (!track) return null;
    const isCurrent = currentTrack?.videoId === track.videoId;

    return (
      <div
        key={`${track.videoId}-${index}`}
        className={cn(
          'group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors',
          isCurrent ? 'bg-lavender/[0.09]' : 'hover:bg-white/[0.045]'
        )}
      >
        <button
          type="button"
          onClick={() => jumpTo(index)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
            {track.thumbnail ? (
              <img src={track.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <ListMusic className="absolute inset-0 m-auto h-4 w-4 text-mist/40" />
            )}
            {isCurrent && isPlaying && (
              <span className="absolute inset-0 grid place-items-center bg-black/45">
                <span className="flex h-3 items-end gap-[1px]">
                  <span className="eq-bar h-2 w-[2px] rounded-full bg-lavender" />
                  <span className="eq-bar h-3 w-[2px] rounded-full bg-lavender" />
                  <span className="eq-bar h-2.5 w-[2px] rounded-full bg-lavender" />
                </span>
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'block truncate text-[12px] font-medium',
                isCurrent ? 'text-lavender' : 'text-white/90'
              )}
            >
              {track.title}
            </span>
            <span className="mt-0.5 block truncate text-[10px] text-mist/50">{track.artist}</span>
          </span>
          <span className="shrink-0 text-[9px] tabular-nums text-mist/40">
            {formatDuration(track.duration)}
          </span>
        </button>
        <button
          type="button"
          onClick={() => removeFromQueue(track.videoId)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-mist/35 transition hover:bg-white/10 hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
          aria-label={`Remove ${track.title} from queue`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Play queue">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setQueueOpen(false)}
        aria-label="Close queue"
      />
      <aside className="absolute inset-x-0 bottom-0 flex max-h-[84dvh] flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-ink-900/95 shadow-2xl backdrop-blur-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[390px] lg:rounded-none lg:rounded-l-3xl lg:border-y-0 lg:border-r-0">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <ListMusic className="h-4 w-4 text-lavender" />
              Play queue
            </h2>
            <p className="mt-0.5 text-[10px] text-mist/45">
              {queue.length} track{queue.length === 1 ? '' : 's'} · resolved at play time
            </p>
          </div>
          <div className="flex items-center gap-1">
            {queue.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearQueue}
                className="text-[10px]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
            <button
              type="button"
              onClick={() => setQueueOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-full text-mist/60 transition hover:bg-white/[0.07] hover:text-white"
              aria-label="Close queue"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {queue.length ? (
            queue.length > 50 ? (
              <Virtuoso
                style={{ height: '100%' }}
                totalCount={queue.length}
                itemContent={(index) => row(index)}
              />
            ) : (
              <div className="space-y-1">{queue.map((_, index) => row(index))}</div>
            )
          ) : (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-lavender">
                <ListMusic className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-medium text-white">The queue is empty</p>
              <p className="mt-1 text-[11px] leading-relaxed text-mist/50">
                Play a track from the feed, then use the + button on any card to line up what comes
                next.
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
