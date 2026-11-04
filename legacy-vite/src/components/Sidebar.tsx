import React from 'react';
import {
  Home,
  Search,
  Library,
  Heart,
  Clock,
  Sparkles,
  Mic2,
  Plus,
  FolderOpen,
  CloudCheck,
} from 'lucide-react';
import { NavTab } from '../types/music';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  likedCount: number;
  localCount: number;
  activePlaylist: string | null;
  onSelectPlaylist: (playlistName: string) => void;
  onOpenLocalFiles: () => void;
}

const PLAYLISTS = [
  'Midnight Coffee',
  'Rainy Lo-Fi Sanctuary',
  'Late Night Coding',
  'Acoustic Solitude',
  'Deep Ambient & Sleep',
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  likedCount,
  localCount,
  activePlaylist,
  onSelectPlaylist,
  onOpenLocalFiles,
}) => {
  const navItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'home', label: 'Home', icon: <Home size={19} strokeWidth={1.5} /> },
    { id: 'search', label: 'Search', icon: <Search size={19} strokeWidth={1.5} /> },
    { id: 'lyrics', label: 'Now Playing & Lyrics', icon: <Mic2 size={19} strokeWidth={1.5} /> },
    {
      id: 'library',
      label: 'Your Library',
      icon: <Library size={19} strokeWidth={1.5} />,
      badge: localCount > 0 ? localCount : undefined,
    },
    {
      id: 'favorites',
      label: 'Liked Songs',
      icon: <Heart size={19} strokeWidth={1.5} />,
      badge: likedCount,
    },
    { id: 'recent', label: 'Recent', icon: <Clock size={19} strokeWidth={1.5} /> },
    { id: 'support', label: 'Support DVibes', icon: <Sparkles size={19} strokeWidth={1.5} /> },
  ];

  return (
    <aside className="fixed left-0 top-0 bottom-20 w-[240px] bg-[#18181C] border-r border-[#2A2A30] z-40 flex flex-col justify-between select-none">
      <div className="flex flex-col flex-1 min-h-0">
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-[#2A2A30]/70">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#B8A9C9]/20 border border-[#B8A9C9]/40 flex items-center justify-center text-[#B8A9C9] font-display font-semibold text-sm">
              D
            </div>
            <div className="flex flex-col">
              <span className="font-display font-semibold text-[15px] text-[#EAEAF0] tracking-tight leading-none">
                DVibes
              </span>
              <span className="text-[10px] text-[#9A9AA3] mt-0.5">Midnight Space</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 opacity-70">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2A2A30] hover:bg-[#ffb4ab] transition-colors" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#2A2A30] hover:bg-[#A9C9B8] transition-colors" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#2A2A30] hover:bg-[#B8A9C9] transition-colors" />
          </div>
        </div>

        {/* Navigation Links */}
        <div className="px-3 py-4">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id && !activePlaylist;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-[#2a2a2c] text-[#B8A9C9] font-semibold shadow-sm'
                      : 'text-[#9A9AA3] hover:bg-[#1E1E24] hover:text-[#EAEAF0]'
                  }`}
                >
                  <span className="flex items-center gap-3 truncate">
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#1E1E24] border border-[#2A2A30] text-[#B8A9C9]">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Local File Import Action */}
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={onOpenLocalFiles}
            className="w-full py-2 px-3 rounded-full bg-[#1E1E24] hover:bg-[#25252D] border border-[#2A2A30] text-xs font-medium text-[#EAEAF0] flex items-center justify-center gap-2 transition-all hover:border-[#B8A9C9]/50"
          >
            <FolderOpen size={14} strokeWidth={1.5} className="text-[#A9C9B8]" />
            <span>Import Local Audio</span>
          </button>
        </div>

        {/* Playlists Section */}
        <div className="px-5 pt-2 flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between text-[#9A9AA3] py-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold">Playlists</span>
            <button
              type="button"
              onClick={() => onSelectTab('favorites')}
              title="View Liked Songs"
              className="text-[#9A9AA3] hover:text-[#B8A9C9] p-1 rounded-md hover:bg-[#1E1E24] transition-colors"
            >
              <Plus size={14} strokeWidth={1.5} />
            </button>
          </div>
          <div className="mt-1 flex flex-col gap-1 overflow-y-auto pr-1">
            {PLAYLISTS.map((name) => {
              const selected = activePlaylist === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSelectPlaylist(name)}
                  className={`text-left px-2.5 py-1.5 rounded-lg text-xs truncate transition-colors ${
                    selected
                      ? 'bg-[#1E1E24] text-[#B8A9C9] font-medium'
                      : 'text-[#9A9AA3] hover:text-[#EAEAF0] hover:bg-[#1E1E24]/60'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Offline Sync Status Footer */}
      <div className="p-3.5 border-t border-[#2A2A30]/70 bg-[#0e0e10]/50">
        <div className="flex items-center justify-between px-2 py-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#A9C9B8] animate-pulse" />
            <span className="text-[11px] font-medium text-[#9A9AA3]">Audius Ad-Free Stream</span>
          </div>
          <CloudCheck size={15} strokeWidth={1.5} className="text-[#A9C9B8]" />
        </div>
      </div>
    </aside>
  );
};
