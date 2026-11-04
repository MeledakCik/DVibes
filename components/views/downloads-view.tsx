'use client';

import { OfflineView, type OfflineViewProps } from '@/components/views/offline-view';

export type DownloadsViewProps = OfflineViewProps;

export function DownloadsView(props: DownloadsViewProps) {
  return <OfflineView {...props} />;
}
