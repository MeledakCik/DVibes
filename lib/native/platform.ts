/**
 * Thin bridge between the web UI and the native (Tauri 2) shell.
 *
 * The UI is a static bundle that lives inside the app on Android, iOS, macOS and
 * Windows. Network calls go through the Rust HTTP client (no CORS, custom
 * User-Agent allowed) and offline files are written to the app's private data
 * directory by Rust commands. When the bundle is opened in a normal browser
 * (e.g. `npm run dev`) everything degrades to plain `fetch` and downloads are
 * disabled.
 */

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export function isNative(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export type NativePlatform = 'android' | 'ios' | 'macos' | 'windows' | 'linux' | 'web';

export function detectPlatform(): NativePlatform {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent.toLowerCase();
  if (!isNative()) return 'web';
  if (ua.includes('android')) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  // iPadOS reports as Macintosh but has touch points.
  if (ua.includes('macintosh') && navigator.maxTouchPoints > 1) return 'ios';
  if (ua.includes('mac os')) return 'macos';
  if (ua.includes('windows')) return 'windows';
  return 'linux';
}

export function isMobilePlatform(): boolean {
  const p = detectPlatform();
  return p === 'android' || p === 'ios';
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let cachedNativeFetch: FetchLike | null = null;

async function loadNativeFetch(): Promise<FetchLike> {
  if (cachedNativeFetch) return cachedNativeFetch;
  const mod = await import('@tauri-apps/plugin-http');
  cachedNativeFetch = mod.fetch as unknown as FetchLike;
  return cachedNativeFetch;
}

/** fetch() that bypasses CORS when running inside the native shell. */
export async function nativeFetch(input: string, init?: RequestInit): Promise<Response> {
  if (isNative()) {
    const f = await loadNativeFetch();
    return f(input, init);
  }
  return fetch(input, init);
}

export async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

export async function listenNative<T>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> {
  return listen<T>(event, (e) => handler(e.payload));
}

/** Turn an absolute file path into a URL the <audio>/<img> element can load. */
export function fileUrl(path: string): string {
  return convertFileSrc(path);
}
