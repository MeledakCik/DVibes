'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  attempts?: string[];
  compact?: boolean;
}

export function ErrorState({
  title = 'The upstream APIs did not answer',
  message,
  onRetry,
  attempts,
  compact = false
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={
        compact
          ? 'flex flex-wrap items-center gap-3 rounded-xl border border-red-400/15 bg-red-400/[0.06] px-4 py-3'
          : 'flex flex-col items-center justify-center rounded-2xl border border-red-400/15 bg-red-400/[0.045] px-6 py-14 text-center'
      }
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-400/10 text-red-300">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <div className={compact ? 'min-w-0 flex-1' : 'mt-4 max-w-xl'}>
        <h3 className={compact ? 'text-sm font-medium text-white' : 'text-lg font-semibold text-white'}>
          {title}
        </h3>
        <p className={compact ? 'mt-0.5 text-xs text-red-200/70' : 'mt-2 text-sm leading-relaxed text-red-100/65'}>
          {message}
        </p>
        {attempts && attempts.length > 0 && (
          <details className="mt-3 text-left">
            <summary className="cursor-pointer text-[10px] uppercase tracking-[0.18em] text-mist/45 hover:text-mist">
              {attempts.length} provider attempt{attempts.length === 1 ? '' : 's'}
            </summary>
            <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto scrollbar-thin rounded-lg bg-black/25 p-3 font-mono text-[10px] leading-relaxed text-mist/55">
              {attempts.map((attempt, index) => (
                <li key={`${index}-${attempt.slice(0, 20)}`} className="break-all">
                  {attempt}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {onRetry && (
        <Button
          type="button"
          variant={compact ? 'secondary' : 'default'}
          size={compact ? 'sm' : 'default'}
          onClick={onRetry}
          className={compact ? '' : 'mt-5'}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
