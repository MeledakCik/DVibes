import { applyAudioElementTuning, type TuningHz } from '@/lib/api/native-bridge';

let audioElement: HTMLAudioElement | null = null;
let currentTuning: TuningHz = 440;

export function registerAudioElement(element: HTMLAudioElement | null): void {
  audioElement = element;
  if (audioElement) {
    applyAudioElementTuning(audioElement, currentTuning);
  }
}

export function getAudioElement(): HTMLAudioElement | null {
  return audioElement;
}

export function seekAudio(time: number): void {
  if (!audioElement) return;
  try {
    audioElement.currentTime = Math.max(0, time);
  } catch {
    // metadata may not be ready yet
  }
}

export function restartAudio(): void {
  if (!audioElement) return;
  try {
    audioElement.currentTime = 0;
    applyAudioElementTuning(audioElement, currentTuning);
    const promise = audioElement.play();
    if (promise) promise.catch(() => undefined);
  } catch {
    // audio may not be ready yet
  }
}

export function setAudioVolume(volume: number, muted: boolean): void {
  if (!audioElement) return;
  audioElement.volume = Math.min(1, Math.max(0, volume));
  audioElement.muted = muted;
}

export function setAudioTuning(tuning: TuningHz): void {
  currentTuning = tuning;
  applyAudioElementTuning(audioElement, tuning);
}

export function getAudioTuning(): TuningHz {
  return currentTuning;
}

export function pauseAudio(): void {
  audioElement?.pause();
}
