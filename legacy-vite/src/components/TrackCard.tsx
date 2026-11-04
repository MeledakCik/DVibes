import React from 'react';
import { Play, Pause, Heart } from 'lucide-react';
import { Track } from '../types/music';

interface TrackCardProps {
  track: Track;
  isPlaying: boolean;
  isCurrentTrack: boolean;
  isLiked: boolean;
  onPlayTrack: (track: Track) => void;
  onToggleLike: (track: Track, e: React.MouseEvent) => void;
}

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '03:30';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const TrackCard: React.FC<TrackCardProps> = ({
  track,
  isPlaying,
  isCurrentTrack,
  isLiked,
  onPlayTrack,
  onToggleLike,
}) => {
  return (
    <div
      onClick={() => onPlayTrack(track)}
      className={`group flex flex-col p-3.5 rounded-[14px] bg-[#1E1E24] border transition-all duration-300 cursor-pointer hover:-translate-y-0.5 ${
        isCurrentTrack
          ? 'border-[#B8A9C9]/70 bg-[#25252D]'
          : 'border-[#2A2A30] hover:border-[#3A3A42] hover:bg-[#25252D]'
      }`}
    >
      {/* Artwork Container */}
      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-[#18181C] mb-3">
        <img
          src={track.artwork}
          alt={track.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#121214]/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-between p-2.5">
          <button
            type="button"
            onClick={(e) => onToggleLike(track, e)}
            aria-label="Like track"
            className={`w-8 h-8 rounded-full bg-[#121214]/80 backdrop-blur-md flex items-center justify-center transition-transform hover:scale-110 ${
              isLiked ? 'text-[#B8A9C9]' : 'text-[#EAEAF0]'
            }`}
          >
            <Heart size={15} strokeWidth={1.5} fill={isLiked ? '#B8A9C9' : 'none'} />
          </button>
          <button
            type="button"
            aria-label={isCurrentTrack && isPlaying ? 'Pause' : 'Play'}
            className="w-10 h-10 rounded-full bg-[#B8A9C9] text-[#121214] flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all"
          >
            {isCurrentTrack && isPlaying ? (
              <Pause size={18} strokeWidth={2} fill="#121214" />
            ) : (
              <Play size={18} strokeWidth={2} fill="#121214" className="ml-0.5" />
            )}
          </button>
        </div>

        {/* Mood / Source Badge */}
        {track.moodTag && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#121214]/80 backdrop-blur-md text-[#A9B5C9] border border-[#2A2A30]/60">
            {track.moodTag}
          </span>
        )}
      </div>

      {/* Metadata */}
      <div className="flex flex-col min-w-0">
        <span
          className={`font-display text-sm font-medium truncate transition-colors ${
            isCurrentTrack ? 'text-[#B8A9C9]' : 'text-[#EAEAF0] group-hover:text-[#B8A9C9]'
          }`}
        >
          {track.title}
        </span>
        <span className="text-xs text-[#9A9AA3] truncate mt-0.5">{track.artist}</span>
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[#2A2A30]/70 text-[11px] text-[#9A9AA3]">
          <span className="font-mono tabular-nums">{formatDuration(track.duration)}</span>
          <span className="uppercase tracking-wider text-[10px] text-[#A9C9B8]">
            {track.source === 'local' ? 'LOCAL' : track.source.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
};
