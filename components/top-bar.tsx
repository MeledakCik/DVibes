'use client';

import { useState } from 'react';
import { AudioLines, Clock3, Radio, Search, Sparkles } from 'lucide-react';
import { useIsOffline } from '@/lib/store/network-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type AppView } from '@/components/sidebar';
import { cn } from '@/lib/utils';

interface TopBarProps {
  view: AppView;
  onChangeView: (view: AppView) => void;
  onSearch: (query: string) => void;
}

const TITLES: Record<AppView, { title: string; subtitle: string }> = {
  home: { title: 'Midnight rotation', subtitle: 'Fetched live — the last feed is kept for offline' },
  search: { title: 'Search', subtitle: 'Every result is a real, playable video' },
  lyrics: { title: 'Lyrics', subtitle: 'Synced LRC from LRCLIB, saved on the device for offline' },
  downloads: { title: 'Downloads', subtitle: 'Songs, artwork and lyrics available without internet' },
  favorites: { title: 'Favorites', subtitle: 'Saved locally on this device' },
  recent: { title: 'Recently played', subtitle: 'Your personal listening trail' }
};

export function TopBar({ view, onChangeView, onSearch }: TopBarProps) {
  const [query, setQuery] = useState('');
  const heading = TITLES[view];
  const offline = useIsOffline();

  return (
    <header className="relative z-20 shrink-0 border-b border-white/[0.055] bg-ink-950/55 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl md:px-8 md:pb-5 md:pt-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChangeView('home')}
          className="flex items-center gap-2.5 lg:hidden"
          aria-label="DVibes home"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-lavender to-sage text-ink-950 shadow-glow">
            <AudioLines className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <span className="text-left">
            <span className="block text-sm font-semibold text-white">DVibes</span>
            <span className="block text-[9px] uppercase tracking-[0.2em] text-mist/60">
              midnight radio
            </span>
          </span>
        </button>

        <div className="hidden min-w-0 flex-1 lg:block">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight text-white lg:text-2xl">
              {heading.title}
            </h1>
            <Badge variant="sage" className="hidden shrink-0 xl:inline-flex">
              <Radio className="h-3 w-3" />
              {offline ? 'offline' : 'live API'}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-mist/60">{heading.subtitle}</p>
        </div>

        <form
          className="ml-auto hidden w-full max-w-[300px] shrink-0 items-center gap-2 lg:flex xl:max-w-md"
          onSubmit={(event) => {
            event.preventDefault();
            if (!query.trim()) return;
            onSearch(query.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mist/50" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a song, artist, or mood…"
              className="h-10 w-full rounded-full border border-white/10 bg-white/[0.045] pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-mist/50 focus:border-lavender/45 focus:bg-white/[0.07] focus:ring-2 focus:ring-lavender/10"
              aria-label="Search music"
            />
          </div>
          <Button type="submit" size="sm" className="h-10 px-4">
            Search
          </Button>
        </form>

        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-10 w-10"
            onClick={() => onChangeView('recent')}
            aria-label="Recently played"
          >
            <Clock3 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-10 w-10"
            onClick={() => onChangeView('search')}
            aria-label="Open search"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 lg:hidden">
        <p className="truncate text-[10px] text-mist/50">{heading.subtitle}</p>
        <Sparkles className="h-3 w-3 shrink-0 text-lavender/60" />
      </div>
    </header>
  );
}
