'use client';

import { fileUrl } from '@/lib/native/platform';
import { useDownloadsStore } from '@/lib/store/downloads-store';
import type { Track } from '@/lib/types';

/** Artwork URL: the saved local copy when the track is downloaded, else the remote thumbnail. */
export function useArtwork(track: Pick<Track, 'videoId' | 'thumbnail'> | null | undefined): string {
  const thumbPath = useDownloadsStore((state) => (track ? state.files[track.videoId]?.thumbPath : undefined));
  if (!track) return '';
  return thumbPath ? fileUrl(thumbPath) : track.thumbnail;
}
