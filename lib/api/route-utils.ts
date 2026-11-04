import { NextResponse } from 'next/server';
import type { ApiResponse } from '@/lib/types';

const NO_STORE = {
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff'
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    { ok: true, data },
    {
      ...init,
      headers: { ...NO_STORE, ...(init?.headers || {}) }
    }
  );
}

export function fail(
  code: string,
  message: string,
  status = 502,
  attempts?: string[]
): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(attempts?.length ? { attempts } : {}) } },
    { status, headers: NO_STORE }
  );
}

export function errorAttempts(error: unknown): string[] | undefined {
  if (error && typeof error === 'object' && 'attempts' in error) {
    const attempts = (error as { attempts?: unknown }).attempts;
    if (Array.isArray(attempts)) return attempts.map(String);
  }
  return undefined;
}

export function logProviderFailure(scope: string, error: unknown): void {
  console.error(`[dvibes:${scope}]`, error instanceof Error ? error.message : error);
}
