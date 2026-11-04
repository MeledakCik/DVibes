'use client';

import { RefreshCw, TriangleAlert } from 'lucide-react';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-red-400/15 bg-red-400/[0.05] p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-400/10 text-red-300">
          <TriangleAlert className="h-5 w-5" />
        </span>
        <h1 className="mt-5 text-xl font-semibold text-white">The interface hit a snag</h1>
        <p className="mt-2 text-sm leading-relaxed text-mist/60">
          {error.message || 'An unexpected error occurred while rendering the player.'}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-ink-950 transition hover:bg-lavender"
        >
          <RefreshCw className="h-4 w-4" />
          Reload the app
        </button>
      </div>
    </div>
  );
}
