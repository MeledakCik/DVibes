'use client';

import { CloudOff, Wifi } from 'lucide-react';
import { useNetworkInfo } from '@/lib/store/network-store';
import { useSettingsStore } from '@/lib/store/settings-store';
import { useDownloadsStore, useOfflineStore } from '@/lib/store/downloads-store';
import { cn } from '@/lib/utils';

export function OfflineBanner({ onOpenDownloads }: { onOpenDownloads: () => void }) {
  const { offline, forced } = useNetworkInfo();
  const setForceOffline = useSettingsStore((state) => state.setForceOffline);
  const downloadedCount = useDownloadsStore((state) => Object.keys(state.files).length);
  const localCount = useOfflineStore((state) => state.localTracks.length);
  const savedCount = downloadedCount + localCount;

  if (!offline) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-300/15 text-amber-200">
        <CloudOff className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-white">
          {forced ? 'Offline mode is on' : 'No internet connection'}
        </p>
        <p className="text-[11px] leading-relaxed text-mist/70">
          {savedCount > 0
            ? `Playing from ${savedCount} offline/local track${savedCount === 1 ? '' : 's'}. Saved & imported .LRC lyrics still sync.`
            : 'Nothing is saved yet. Import local .mp3/.flac/.lrc files or download tracks while online.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenDownloads}
          className="rounded-full bg-white/10 px-3.5 py-2 text-[11px] font-medium text-white transition hover:bg-white/15"
        >
          Open offline library
        </button>
        {forced && (
          <button
            type="button"
            onClick={() => setForceOffline(false)}
            className="inline-flex items-center gap-1.5 rounded-full bg-lavender px-3.5 py-2 text-[11px] font-semibold text-ink-950 transition hover:brightness-110"
          >
            <Wifi className="h-3.5 w-3.5" />
            Go online
          </button>
        )}
      </div>
    </div>
  );
}

export function OfflineToggle({ className }: { className?: string }) {
  const { offline, forced, deviceOnline } = useNetworkInfo();
  const toggle = useSettingsStore((state) => state.toggleForceOffline);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={forced}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
        offline
          ? 'border-amber-300/25 bg-amber-300/[0.07]'
          : 'border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.05]',
        className
      )}
    >
      <span
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
          offline ? 'bg-amber-300/15 text-amber-200' : 'bg-white/[0.05] text-mist'
        )}
      >
        {offline ? <CloudOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-white">Offline mode</span>
        <span className="block truncate text-[10px] text-mist/60">
          {!deviceOnline
            ? 'No connection detected'
            : forced
              ? 'On — downloads & local files only'
              : 'Off — using internet'}
        </span>
      </span>
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition',
          forced ? 'bg-lavender' : 'bg-white/15'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
            forced ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </span>
    </button>
  );
}
