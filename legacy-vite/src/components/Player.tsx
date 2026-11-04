import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Heart,
  Volume2,
  VolumeX,
  ListMusic,
  Mic2,
  Maximize2,
} from 'lucide-react';
import { Track } from '../types/music';
import { formatDuration } from './TrackCard';

interface PlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: boolean;
  isLiked: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onToggleLike: (track: Track, e: React.MouseEvent) => void;
  onOpenLyrics: () => void;
  onToggleQueueDrawer: () => void;
}

export const Player: React.FC<PlayerProps> = ({
  currentTrack,
  isPlaying,
  progress,
  duration,
  volume,
  isMuted,
  shuffle,
  repeat,
  isLiked,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onToggleRepeat,
  onToggleLike,
  onOpenLyrics,
  onToggleQueueDrawer,
}) => {
  const effectiveDuration = duration || currentTrack?.duration || 240;
  const percent = Math.min(100, Math.max(0, (progress / effectiveDuration) * 100));

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * effectiveDuration);
  };

  const handleVolumeBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onVolumeChange(ratio);
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 h-[80px] bg-[#18181C]/95 backdrop-blur-md border-t border-[#2A2A30] z-50 px-6 flex items-center justify-between select-none">
      {/* Left: 56x56 Rounded Album Art + Title + Artist */}
      <div className="flex items-center gap-3.5 w-1/4 min-w-[220px]">
        <div className="w-[56px] h-[56px] rounded-xl bg-[#1E1E24] border border-[#2A2A30] flex-shrink-0 overflow-hidden flex items-center justify-center">
          {currentTrack ? (
            <img
              src={currentTrack.artwork}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xs text-[#9A9AA3]">DV</span>
          )}
        </div>
        <div className="flex flex-col min-w-0 pr-2">
          <span className="text-sm font-medium text-[#EAEAF0] truncate">
            {currentTrack?.title || 'Select a track'}
          </span>
          <span className="text-xs text-[#9A9AA3] truncate">
            {currentTrack?.artist || 'DVibes Sanctuary'}
          </span>
        </div>
        {currentTrack && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => onToggleLike(currentTrack, e)}
              className={`p-1.5 rounded-full transition-colors ${
                isLiked ? 'text-[#B8A9C9]' : 'text-[#9A9AA3] hover:text-[#EAEAF0]'
              }`}
              title="Save to Liked Songs"
            >
              <Heart size={18} strokeWidth={1.5} fill={isLiked ? '#B8A9C9' : 'none'} />
            </button>
            <button
              type="button"
              onClick={onOpenLyrics}
              className="p-1.5 text-[#9A9AA3] hover:text-[#EAEAF0] transition-colors"
              title="Lyrics & Visualizer"
            >
              <Mic2 size={17} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>

      {/* Center: Controls + Thin 3px Lavender Progress Bar */}
      <div className="flex flex-col items-center gap-1.5 w-2/4 max-w-xl">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={onToggleShuffle}
            className={`relative transition-colors ${
              shuffle ? 'text-[#B8A9C9]' : 'text-[#9A9AA3] hover:text-[#EAEAF0]'
            }`}
            title="Shuffle"
          >
            <Shuffle size={17} strokeWidth={1.5} />
            {shuffle && (
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#B8A9C9]" />
            )}
          </button>

          <button
            type="button"
            onClick={onPrev}
            className="text-[#9A9AA3] hover:text-[#EAEAF0] transition-colors"
            title="Previous"
          >
            <SkipBack size={20} strokeWidth={1.5} />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            className="w-11 h-11 rounded-full bg-[#B8A9C9] text-[#121214] flex items-center justify-center shadow-lg hover:brightness-105 hover:scale-105 active:scale-95 transition-all"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={20} strokeWidth={2} fill="#121214" />
            ) : (
              <Play size={20} strokeWidth={2} fill="#121214" className="ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onNext}
            className="text-[#9A9AA3] hover:text-[#EAEAF0] transition-colors"
            title="Next"
          >
            <SkipForward size={20} strokeWidth={1.5} />
          </button>

          <button
            type="button"
            onClick={onToggleRepeat}
            className={`relative transition-colors ${
              repeat ? 'text-[#B8A9C9]' : 'text-[#9A9AA3] hover:text-[#EAEAF0]'
            }`}
            title="Repeat"
          >
            <Repeat size={17} strokeWidth={1.5} />
            {repeat && (
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#B8A9C9]" />
            )}
          </button>
        </div>

        {/* Thin 3px Clickable Progress Bar */}
        <div className="w-full flex items-center gap-3">
          <span className="text-[11px] font-mono tabular-nums text-[#9A9AA3] w-9 text-right">
            {formatDuration(progress)}
          </span>
          <div
            onClick={handleProgressBarClick}
            className="relative flex-1 h-[3px] hover:h-[5px] bg-[#2A2A30] rounded-full cursor-pointer group transition-all"
          >
            <div
              className="absolute left-0 top-0 bottom-0 bg-[#B8A9C9] rounded-full transition-all"
              style={{ width: `${percent}%` }}
            />
            <div
              className="absolute -top-1 w-2.5 h-2.5 rounded-full bg-[#EAEAF0] shadow opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${percent}% - 5px)` }}
            />
          </div>
          <span className="text-[11px] font-mono tabular-nums text-[#9A9AA3] w-9">
            {formatDuration(effectiveDuration)}
          </span>
        </div>
      </div>

      {/* Right: Queue + Volume + Fullscreen Lyrics */}
      <div className="flex items-center justify-end gap-4 w-1/4 min-w-[200px]">
        <button
          type="button"
          onClick={onToggleQueueDrawer}
          className="text-[#9A9AA3] hover:text-[#EAEAF0] transition-colors"
          title="Toggle Play Queue"
        >
          <ListMusic size={19} strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-2 group">
          <button
            type="button"
            onClick={onToggleMute}
            className="text-[#9A9AA3] hover:text-[#EAEAF0] transition-colors"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX size={19} strokeWidth={1.5} />
            ) : (
              <Volume2 size={19} strokeWidth={1.5} />
            )}
          </button>
          <div
            onClick={handleVolumeBarClick}
            className="w-20 h-[3px] hover:h-[5px] bg-[#2A2A30] rounded-full relative cursor-pointer transition-all"
          >
            <div
              className="h-full bg-[#B8A9C9] rounded-full"
              style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenLyrics}
          className="text-[#9A9AA3] hover:text-[#EAEAF0] transition-colors"
          title="Expand Sanctuary Visualizer"
        >
          <Maximize2 size={18} strokeWidth={1.5} />
        </button>
      </div>
    </footer>
  );
};
