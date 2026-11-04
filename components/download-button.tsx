'use client';

import { AlertTriangle, ArrowDownToLine, Check, Loader2, X } from 'lucide-react';
import { useHydrated } from '@/hooks/use-hydrated';
import { isNative } from '@/lib/native/platform';
import { useDownloadsStore } from '@/lib/store/downloads-store';
import { useIsOffline } from '@/lib/store/network-store';
import type { Track } from '@/lib/types';
import { cn } from '@/lib/utils';

interface DownloadButtonProps {
  track: Track;
  className?: string;
  /** "icon" is a round button (cards), "pill" shows a label (lyrics / downloads). */
  variant?: 'icon' | 'pill';
  size?: 'sm' | 'md';
}

export function DownloadButton({ track, className, variant = 'icon', size = 'sm' }: DownloadButtonProps) {
  const hydrated = useHydrated();
  const offline = useIsOffline();
  const saved = useDownloadsStore((state) => !!state.files[track.videoId] && !!state.meta[track.videoId]);
  const progress = useDownloadsStore((state) => state.progress[track.videoId]);
  const download = useDownloadsStore((state) => state.download);
  const cancel = useDownloadsStore((state) => state.cancel);
  const remove = useDownloadsStore((state) => state.remove);

  if (!hydrated || !isNative()) return null;

  const busy = progress?.phase === 'resolving' || progress?.phase === 'downloading';
  const failed = progress?.phase === 'error';
  const percent =
    progress?.phase === 'downloading' && progress.total > 0
      ? Math.min(100, Math.round((progress.received / progress.total) * 100))
      : null;

  const label = saved
    ? 'Saved for offline — tap to remove'
    : busy
      ? 'Downloading — tap to cancel'
      : failed
        ? `Download failed: ${progress?.error ?? 'retry'}`
        : offline
          ? 'Go online to download'
          : 'Download for offline';

  const onClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (saved) void remove(track.videoId);
    else if (busy) void cancel(track.videoId);
    else void download(track);
  };

  const box = size === 'md' ? 'h-10 w-10' : 'h-8 w-8';
  const icon = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';

  const glyph = saved ? (
    <Check className={cn(icon, 'text-sage')} strokeWidth={3} />
  ) : busy ? (
    percent !== null ? (
      <span className="relative grid place-items-center">
        <svg viewBox="0 0 36 36" className={cn(size === 'md' ? 'h-7 w-7' : 'h-6 w-6', '-rotate-90')}>
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="4" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="#c4b5fd"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(percent / 100) * 94.2} 94.2`}
          />
        </svg>
        <X className="absolute h-2.5 w-2.5 text-white/80" />
      </span>
    ) : (
      <Loader2 className={cn(icon, 'animate-spin text-lavender')} />
    )
  ) : failed ? (
    <AlertTriangle className={cn(icon, 'text-amber-300')} />
  ) : (
    <ArrowDownToLine className={icon} />
  );

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!saved && !busy && offline}
        title={label}
        aria-label={label}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[11px] font-medium transition disabled:opacity-40',
          saved
            ? 'border-sage/30 bg-sage/10 text-sage'
            : 'border-white/10 bg-white/[0.05] text-white/80 hover:bg-white/[0.09] hover:text-white',
          className
        )}
      >
        {glyph}
        {saved ? 'Saved offline' : busy ? (percent !== null ? `${percent}%` : 'Preparing…') : failed ? 'Retry' : 'Download'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!saved && !busy && offline}
      title={label}
      aria-label={label}
      className={cn(
        'grid place-items-center rounded-full bg-black/50 text-white/70 backdrop-blur-md transition hover:bg-black/70 hover:text-white disabled:opacity-40',
        box,
        className
      )}
    >
      {glyph}
    </button>
  );
}
