'use client';

import {
  ArrowDownToLine,
  AudioLines,
  Clock3,
  FolderOpen,
  Heart,
  Home,
  Library,
  ScanText,
  Search,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { OfflineToggle } from '@/components/offline-banner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export type AppView = 'home' | 'search' | 'lyrics' | 'downloads' | 'favorites' | 'recent';

const NAV_ITEMS: Array<{
  id: AppView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
}> = [
  { id: 'home', label: 'Home', icon: Home, hint: 'Live discovery' },
  { id: 'search', label: 'Search', icon: Search, hint: 'Any song or artist' },
  { id: 'lyrics', label: 'Lyrics', icon: ScanText, hint: 'Synced + .LRC import' },
  { id: 'downloads', label: 'Offline & Local', icon: ArrowDownToLine, hint: 'Downloads + MP3/FLAC/LRC' },
  { id: 'favorites', label: 'Favorites', icon: Heart, hint: 'Saved on this device' },
  { id: 'recent', label: 'Recently played', icon: Clock3, hint: 'Your listening trail' }
];

interface SidebarProps {
  view: AppView;
  onChangeView: (view: AppView) => void;
  queueCount: number;
}

export function Sidebar({ view, onChangeView, queueCount }: SidebarProps) {
  return (
    <aside className="hidden w-[248px] shrink-0 flex-col overflow-y-auto scrollbar-thin border-r border-white/[0.06] bg-black/20 px-4 py-6 lg:flex lg:w-[264px] lg:pb-28">
      <button
        type="button"
        onClick={() => onChangeView('home')}
        className="group flex items-center gap-3 px-2 text-left"
        aria-label="DVibes home"
      >
        <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-lavender via-[#a78bfa] to-sage text-ink-950 shadow-glow">
          <AudioLines className="h-5 w-5" strokeWidth={2.4} />
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-sage ring-4 ring-ink-950" />
        </span>
        <span>
          <span className="block text-[17px] font-semibold tracking-tight text-white">DVibes</span>
          <span className="block text-[10px] uppercase tracking-[0.24em] text-mist/70">midnight radio</span>
        </span>
      </button>

      <nav className="mt-9 space-y-1" aria-label="Primary">
        <p className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-mist/45">
          Listen
        </p>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                active
                  ? 'bg-white/[0.08] text-white'
                  : 'text-mist hover:bg-white/[0.045] hover:text-white'
              )}
            >
              <span
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-lg border transition-colors',
                  active
                    ? 'border-lavender/25 bg-lavender/15 text-lavender'
                    : 'border-white/8 bg-white/[0.03] text-mist group-hover:text-white'
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{item.label}</span>
                <span className="block truncate text-[10px] text-mist/55">{item.hint}</span>
              </span>
              {item.id === 'favorites' && (
                <Heart className="h-3.5 w-3.5 text-mist/40 group-hover:text-lavender" />
              )}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => onChangeView('downloads')}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-lavender/25 bg-lavender/10 px-3.5 py-2.5 text-xs font-medium text-lavender transition hover:bg-lavender/15"
      >
        <FolderOpen className="h-3.5 w-3.5" />
        Import Local Audio / .LRC
      </button>

      <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[11px] font-medium text-white">
            <Library className="h-3.5 w-3.5 text-lavender" />
            Live queue
          </span>
          <Badge variant="outline">{queueCount}</Badge>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-mist/60">
          Tracks resolve through multi-layer failover or play straight from your offline vault.
        </p>
      </div>

      <div className="mt-auto space-y-3 pt-8">
        <OfflineToggle />
        <div className="rounded-2xl border border-sage/12 bg-sage/[0.04] p-4">
          <div className="flex items-center gap-2 text-[11px] font-medium text-sage">
            <ShieldCheck className="h-3.5 w-3.5" />
            4-layer fallback · on device
          </div>
          <div className="mt-3 space-y-2 text-[10px] text-mist/70">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-lavender" />
                InnerTube (VR / iOS / Android)
              </span>
              <span className="text-mist/40">native</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-sage" />
                Piped & Invidious
              </span>
              <span className="text-mist/40">mirrors</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#fbbf24]" />
                Audius & Local Vault
              </span>
              <span className="text-mist/40">backup</span>
            </div>
          </div>
        </div>
        <p className="flex items-center gap-2 px-1 text-[10px] text-mist/45">
          <Sparkles className="h-3 w-3" />
          No server. No hosting.
        </p>
      </div>
    </aside>
  );
}

export { NAV_ITEMS };
