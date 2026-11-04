import { Skeleton } from '@/components/ui/skeleton';
import { classNamesForGrid } from '@/lib/utils';

export function TrackGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className={classNamesForGrid()}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-3">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <Skeleton className="h-3.5 w-4/5 rounded-full" />
          <Skeleton className="h-3 w-1/2 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="space-y-10">
      <Skeleton className="h-[260px] w-full rounded-3xl md:h-[300px]" />
      <div>
        <div className="mb-5 flex items-center justify-between">
          <Skeleton className="h-6 w-44 rounded-full" />
          <Skeleton className="h-4 w-24 rounded-full" />
        </div>
        <TrackGridSkeleton />
      </div>
    </div>
  );
}
