'use client';

import * as React from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { TrackCard } from '@/components/track-card';
import { cn, classNamesForGrid } from '@/lib/utils';
import type { Track } from '@/lib/types';

interface TrackGridProps {
  tracks: Track[];
  scrollParent?: HTMLElement | null;
  priorityCount?: number;
}

const GridList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, style, ...props }, ref) => (
    <div
      ref={ref}
      style={style}
      className={cn(classNamesForGrid(), 'gap-y-6 pb-44', className)}
      {...props}
    >
      {children}
    </div>
  )
);
GridList.displayName = 'GridList';

/**
 * Native CSS grid for normal result sets. Above 50 tracks we switch to
 * react-virtuoso so a huge search / queue never mounts hundreds of thumbnails.
 */
export function TrackGrid({ tracks, scrollParent, priorityCount = 6 }: TrackGridProps) {
  if (!tracks.length) return null;

  if (tracks.length > 50 && scrollParent) {
    return (
      <VirtuosoGrid
        customScrollParent={scrollParent}
        totalCount={tracks.length}
        overscan={600}
        components={{ List: GridList }}
        itemContent={(index) => (
          <TrackCard
            track={tracks[index]}
            queue={tracks}
            index={index}
            priority={index < priorityCount}
          />
        )}
      />
    );
  }

  return (
    <div className={cn(classNamesForGrid(), 'gap-y-6 pb-6')}>
      {tracks.map((track, index) => (
        <TrackCard
          key={track.videoId}
          track={track}
          queue={tracks}
          index={index}
          priority={index < priorityCount}
        />
      ))}
    </div>
  );
}
