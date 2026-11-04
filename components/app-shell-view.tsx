'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sidebar, type AppView } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
import { HomeView } from '@/components/views/home-view';
import { SearchView, type SearchRequest } from '@/components/views/search-view';
import { CollectionView } from '@/components/views/collection-view';
import { LyricsView } from '@/components/views/lyrics-view';
import { DownloadsView } from '@/components/views/downloads-view';
import { BottomNav } from '@/components/bottom-nav';
import { OfflineBanner } from '@/components/offline-banner';
import { Player } from '@/components/player';
import { QueuePanel } from '@/components/queue-panel';
import { usePlayerStore } from '@/lib/store/player-store';

export function AppShellView() {
  const [view, setView] = useState<AppView>('home');
  const [searchRequest, setSearchRequest] = useState<SearchRequest>({ query: '', id: 0 });
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
  const queue = usePlayerStore((state) => state.queue);

  const openSearch = useCallback((query: string) => {
    setSearchRequest({ query, id: Date.now() });
    setView('search');
  }, []);

  const changeView = useCallback((next: AppView) => {
    setView(next);
  }, []);

  useEffect(() => {
    if (!scrollParent) return;
    scrollParent.scrollTop = 0;
  }, [view, scrollParent]);

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-transparent">
      <Sidebar view={view} onChangeView={changeView} queueCount={queue.length} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar view={view} onChangeView={changeView} onSearch={openSearch} />

        <main
          ref={setScrollParent}
          className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-thin px-4 pb-64 pt-4 md:px-8 md:pb-40 md:pt-6"
        >
          <div className="mx-auto w-full max-w-[1640px]">
            {view !== 'lyrics' && <OfflineBanner onOpenDownloads={() => changeView('downloads')} />}

            {view === 'home' && <HomeView onSearch={openSearch} scrollParent={scrollParent} />}

            {view === 'search' && (
              <SearchView
                request={searchRequest}
                scrollParent={scrollParent}
                onExplore={() => changeView('home')}
              />
            )}

            {view === 'lyrics' && <LyricsView onExplore={() => changeView('home')} />}

            {view === 'downloads' && (
              <DownloadsView scrollParent={scrollParent} onExplore={() => changeView('home')} />
            )}

            {view === 'favorites' && (
              <CollectionView
                kind="favorites"
                scrollParent={scrollParent}
                onExplore={() => changeView('home')}
                onSearch={() => {
                  setSearchRequest({ query: '', id: Date.now() });
                  setView('search');
                }}
              />
            )}

            {view === 'recent' && (
              <CollectionView
                kind="recent"
                scrollParent={scrollParent}
                onExplore={() => changeView('home')}
                onSearch={() => {
                  setSearchRequest({ query: '', id: Date.now() });
                  setView('search');
                }}
              />
            )}
          </div>
        </main>
      </div>

      <Player onOpenLyrics={() => changeView('lyrics')} />
      <BottomNav view={view} onChangeView={changeView} />
      <QueuePanel />
    </div>
  );
}
