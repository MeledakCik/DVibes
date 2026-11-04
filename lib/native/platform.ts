/**
 * Bridge between the web UI and the native (Tauri 2) shell, plus real Web Audio
 * DSP pitch tuning (440Hz / 432Hz / 528Hz), procedural ambient soundscapes, and
 * mobile screen-off playback keep-alive.
 */

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type TuningHz = 440 | 432 | 528;
export type AmbientStemId = 'rain' | 'vinyl' | 'fire' | 'wind';

export interface NativeCachedStreamResult {
  videoId: string;
  path: string;
  thumbPath?: string | null;
  bytes: number;
}

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

function extFromMime(mime?: string): string {
  if (!mime) return 'm4a';
  const lower = mime.toLowerCase();
  if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('aac')) return 'm4a';
  if (lower.includes('webm') || lower.includes('opus')) return 'webm';
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('flac')) return 'flac';
  if (lower.includes('wav')) return 'wav';
  return 'm4a';
}

/**
 * Uses the Tauri Rust `cache_stream_track` command to fetch a stream with
 * 2 MB ranged requests and the exact client User-Agent into `$APPDATA/stream_cache/`,
 * returning a local `asset://` URL that `<audio>` plays without 403/CORS errors.
 */
export async function cacheRemoteStreamNative(params: {
  videoId: string;
  url: string;
  userAgent?: string;
  mimeType?: string;
}): Promise<string | null> {
  if (!isNative()) return null;
  const ext = extFromMime(params.mimeType);
  const res = await invokeNative<NativeCachedStreamResult>('cache_stream_track', {
    videoId: params.videoId,
    url: params.url,
    userAgent: params.userAgent ?? null,
    ext
  });
  return res?.path ? fileUrl(res.path) : null;
}

/* -------------------------------------------------------------------------- */
/* Real Harmonic Pitch Tuning (440Hz / 432Hz / 528Hz)                          */
/* -------------------------------------------------------------------------- */

export function playbackRateForTuning(tuning: TuningHz): number {
  if (tuning === 432) return 432 / 440;
  if (tuning === 528) return 444 / 440;
  return 1.0;
}

export function applyAudioElementTuning(audio: HTMLAudioElement | null, tuning: TuningHz): void {
  if (!audio) return;
  const rate = playbackRateForTuning(tuning);
  try {
    const anyAudio = audio as HTMLAudioElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    const preserve = tuning === 440;
    if ('preservesPitch' in anyAudio) anyAudio.preservesPitch = preserve;
    if ('mozPreservesPitch' in anyAudio) anyAudio.mozPreservesPitch = preserve;
    if ('webkitPreservesPitch' in anyAudio) anyAudio.webkitPreservesPitch = preserve;
    audio.playbackRate = rate;
  } catch {
    // ignore if unsupported
  }
}

/* -------------------------------------------------------------------------- */
/* Procedural Web Audio Ambient Soundscapes (100% Offline, Real Synthesis)    */
/* -------------------------------------------------------------------------- */

interface ActiveStemNode {
  gain: GainNode;
  stop: () => void;
}

let sharedAudioCtx: AudioContext | null = null;
const stemNodes = new Map<AmbientStemId, ActiveStemNode>();

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => undefined);
  }
  return sharedAudioCtx;
}

export function setAmbientStemLevel(stem: AmbientStemId, level: number): void {
  const clamped = Math.max(0, Math.min(1, level));
  if (clamped <= 0.005) {
    const existing = stemNodes.get(stem);
    if (existing) {
      existing.stop();
      stemNodes.delete(stem);
    }
    return;
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  const maxGain = stem === 'vinyl' ? 0.06 : stem === 'rain' ? 0.14 : 0.11;
  const targetGain = Math.max(0.001, clamped * maxGain);

  const existing = stemNodes.get(stem);
  if (existing) {
    existing.gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.1);
    return;
  }

  const bufferSeconds = 3;
  const bufferSize = ctx.sampleRate * bufferSeconds;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + white * 0.029;
    b1 = 0.985 * b1 + white * 0.032;
    b2 = 0.95 * b2 + white * 0.045;
    let sample = b0 + b1 + b2;

    if (stem === 'vinyl' && Math.random() < 0.0018) {
      sample += (Math.random() * 2 - 1) * 0.85;
    } else if (stem === 'fire' && Math.random() < 0.003) {
      sample += (Math.random() * 2 - 1) * 0.65;
    }
    data[i] = Math.max(-1, Math.min(1, sample));
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  if (stem === 'rain') {
    filter.type = 'lowpass';
    filter.frequency.value = 1150;
  } else if (stem === 'vinyl') {
    filter.type = 'bandpass';
    filter.frequency.value = 1650;
    filter.Q.value = 0.9;
  } else if (stem === 'fire') {
    filter.type = 'lowpass';
    filter.frequency.value = 620;
  } else {
    filter.type = 'bandpass';
    filter.frequency.value = 340;
    filter.Q.value = 2.2;
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(targetGain, ctx.currentTime + 0.25);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();

  stemNodes.set(stem, {
    gain,
    stop: () => {
      try {
        source.stop();
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    }
  });
}

export function stopAllAmbientStems(): void {
  for (const [id, node] of stemNodes.entries()) {
    node.stop();
    stemNodes.delete(id);
  }
}

/* -------------------------------------------------------------------------- */
/* Mobile Screen-Off / Background Playback Keep-Alive                          */
/* -------------------------------------------------------------------------- */

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

let wakeLockSentinel: WakeLockSentinelLike | null = null;
let keepAliveOsc: OscillatorNode | null = null;
let keepAliveGain: GainNode | null = null;

export async function acquirePlaybackKeepAlive(): Promise<void> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
    };
    if (nav.wakeLock && !wakeLockSentinel) {
      wakeLockSentinel = await nav.wakeLock.request('screen');
    }
  } catch {
    // ignore
  }

  if (isMobilePlatform() && !keepAliveOsc) {
    const ctx = getAudioContext();
    if (ctx) {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 30;
        gain.gain.value = 0.00001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        keepAliveOsc = osc;
        keepAliveGain = gain;
      } catch {
        // ignore
      }
    }
  }
}

export async function releasePlaybackKeepAlive(): Promise<void> {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {
      // ignore
    }
    wakeLockSentinel = null;
  }

  if (keepAliveOsc) {
    try {
      keepAliveOsc.stop();
      keepAliveOsc.disconnect();
      keepAliveGain?.disconnect();
    } catch {
      // ignore
    }
    keepAliveOsc = null;
    keepAliveGain = null;
  }
}
