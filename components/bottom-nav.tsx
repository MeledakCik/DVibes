'use client';

import { ArrowDownToLine, Heart, Home, ScanText, Search } from 'lucide-react';
import { type AppView } from '@/components/sidebar';
import { cn } from '@/lib/utils';

const TABS: Array<{ id: AppView; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'lyrics', label: 'Lyrics', icon: ScanText },
  { id: 'downloads', label: 'Offline', icon: ArrowDownToLine },
  { id: 'favorites', label: 'Saved', icon: Heart }
];

/** Phone-style tab bar. Hidden on desktop, where the sidebar takes over. */
export function BottomNav({ view, onChangeView }: { view: AppView; onChangeView: (view: AppView) => void }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-white/[0.08] bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl lg:hidden"
    >
      <ul className="mx-auto grid h-[3.75rem] max-w-xl grid-cols-5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = view === tab.id;
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onChangeView(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                  active ? 'text-lavender' : 'text-mist/60 active:text-white'
                )}
              >
                <span
                  className={cn(
                    'grid h-6 w-10 place-items-center rounded-full transition-colors',
                    active && 'bg-lavender/15'
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                {tab.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
