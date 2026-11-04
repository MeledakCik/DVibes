import { Howl } from 'howler';
import { Track } from '../types/music';

/**
 * ============================================================================
 * DVIBES SEAMLESS AUDIO ENGINE (Howler.js + Web Audio Ambient Synthesizer)
 * ============================================================================
 * - Manages primary track playback via Howler.js (`html5: true` for streaming
 *   Audius URLs and local Blob URLs without reload glitches).
 * - Provides a built-in Web Audio API procedural lo-fi chord & ambient stem
 *   generator so that if an external stream fails or the user is offline,
 *   warm 432Hz Rhodes chords & rain textures play seamlessly.
 */

type PlaybackUpdateCallback = (state: {
  isPlaying: boolean;
  progress: number;
  duration: number;
}) => void;

class DVibesAudioEngine {
  private howl: Howl | null = null;
  private rafId: number | null = null;
  private currentVolume = 0.78;
  private isMuted = false;
  private onUpdate: PlaybackUpdateCallback | null = null;
  private onTrackEnd: (() => void) | null = null;

  // Fallback Web Audio synth for offline/stream error resilience
  private audioCtx: AudioContext | null = null;
  private fallbackTimer: number | null = null;
  private fallbackStartTime = 0;
  private fallbackElapsed = 0;
  private fallbackDuration = 240;
  private usingFallbackSynth = false;

  // Ambient stems (Rain, Vinyl Crackle, 432Hz Drone)
  private stemNodes: Record<string, { gain: GainNode; stop: () => void }> = {};

  public setCallbacks(onUpdate: PlaybackUpdateCallback, onTrackEnd: () => void) {
    this.onUpdate = onUpdate;
    this.onTrackEnd = onTrackEnd;
  }

  public loadAndPlay(track: Track, autoPlay = true) {
    this.stopAllTrackAudio();
    this.fallbackDuration = track.duration || 240;
    this.fallbackElapsed = 0;
    this.usingFallbackSynth = false;

    this.howl = new Howl({
      src: [track.streamUrl],
      html5: true,
      format: ['mp3', 'flac', 'wav', 'ogg', 'aac'],
      volume: this.isMuted ? 0 : this.currentVolume,
      onload: () => {
        const dur = this.howl?.duration() || track.duration || 240;
        this.emitState(this.howl?.playing() || false, 0, dur);
      },
      onplay: () => {
        this.startProgressLoop();
      },
      onpause: () => {
        this.stopProgressLoop();
        this.emitCurrentHowlState(false);
      },
      onend: () => {
        this.stopProgressLoop();
        if (this.onTrackEnd) this.onTrackEnd();
      },
      onloaderror: () => {
        // Seamless fallback to warm 432Hz Web Audio Sanctuary Synth if offline
        if (autoPlay) {
          this.startFallbackSynth(track.duration || 240);
        }
      },
      onplayerror: () => {
        if (autoPlay) {
          this.startFallbackSynth(track.duration || 240);
        }
      },
    });

    if (autoPlay) {
      this.howl.play();
    } else {
      this.emitState(false, 0, track.duration || 240);
    }
  }

  public togglePlayPause(): boolean {
    if (this.usingFallbackSynth) {
      if (this.fallbackTimer !== null) {
        this.pauseFallbackSynth();
        return false;
      } else {
        this.resumeFallbackSynth();
        return true;
      }
    }

    if (!this.howl) return false;
    if (this.howl.playing()) {
      this.howl.pause();
      return false;
    } else {
      this.howl.play();
      return true;
    }
  }

  public seek(seconds: number) {
    if (this.usingFallbackSynth) {
      this.fallbackElapsed = Math.max(0, Math.min(seconds, this.fallbackDuration));
      this.fallbackStartTime = performance.now() - this.fallbackElapsed * 1000;
      this.emitState(this.fallbackTimer !== null, this.fallbackElapsed, this.fallbackDuration);
      return;
    }

    if (this.howl) {
      this.howl.seek(seconds);
      this.emitCurrentHowlState(this.howl.playing());
    }
  }

  public setVolume(vol: number) {
    this.currentVolume = Math.max(0, Math.min(1, vol));
    this.isMuted = this.currentVolume === 0;
    if (this.howl) {
      this.howl.volume(this.currentVolume);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.howl) {
      this.howl.volume(this.isMuted ? 0 : this.currentVolume);
    }
    return this.isMuted;
  }

  // Web Audio API Ambient Stem Generator (Rain, 432Hz Drone, Vinyl Warmth)
  public setStemLevel(stemId: string, volumePercent: number, active: boolean) {
    const ctx = this.ensureAudioContext();
    if (!active || volumePercent <= 0) {
      if (this.stemNodes[stemId]) {
        this.stemNodes[stemId].stop();
        delete this.stemNodes[stemId];
      }
      return;
    }

    const targetGain = (volumePercent / 100) * 0.18;
    if (this.stemNodes[stemId]) {
      this.stemNodes[stemId].gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.1);
      return;
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.002, targetGain), ctx.currentTime + 0.25);
    gain.connect(ctx.destination);

    if (stemId === 'drone432' || stemId === '528hz') {
      const freq = stemId === '528hz' ? 528 : 432;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.value = freq / 2;
      osc2.frequency.value = freq;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.25;
      osc1.connect(gain);
      osc2.connect(subGain);
      subGain.connect(gain);
      osc1.start();
      osc2.start();
      this.stemNodes[stemId] = {
        gain,
        stop: () => {
          try {
            osc1.stop();
            osc2.stop();
            gain.disconnect();
          } catch {}
        },
      };
    } else {
      // Filtered pink/brown noise for Rain, Vinyl, Fireplace, or Wind
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 2.5;
      }
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = buffer;
      whiteNoise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = stemId === 'vinyl' ? 'bandpass' : 'lowpass';
      filter.frequency.value = stemId === 'vinyl' ? 1400 : stemId === 'wind' ? 380 : 820;

      whiteNoise.connect(filter);
      filter.connect(gain);
      whiteNoise.start();

      this.stemNodes[stemId] = {
        gain,
        stop: () => {
          try {
            whiteNoise.stop();
            gain.disconnect();
          } catch {}
        },
      };
    }
  }

  public playSanctuaryChime(freq = 432) {
    try {
      const ctx = this.ensureAudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.15, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2.1);
    } catch {}
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  private startFallbackSynth(duration: number) {
    this.usingFallbackSynth = true;
    this.fallbackDuration = duration;
    this.fallbackStartTime = performance.now() - this.fallbackElapsed * 1000;
    this.resumeFallbackSynth();
  }

  private resumeFallbackSynth() {
    this.fallbackStartTime = performance.now() - this.fallbackElapsed * 1000;
    this.playChordPulse();
    if (this.fallbackTimer) window.clearInterval(this.fallbackTimer);
    this.fallbackTimer = window.setInterval(() => {
      this.fallbackElapsed = (performance.now() - this.fallbackStartTime) / 1000;
      if (this.fallbackElapsed >= this.fallbackDuration) {
        this.pauseFallbackSynth();
        if (this.onTrackEnd) this.onTrackEnd();
        return;
      }
      if (Math.floor(this.fallbackElapsed) % 4 === 0) {
        this.playChordPulse();
      }
      this.emitState(true, this.fallbackElapsed, this.fallbackDuration);
    }, 250);
    this.emitState(true, this.fallbackElapsed, this.fallbackDuration);
  }

  private pauseFallbackSynth() {
    if (this.fallbackTimer !== null) {
      window.clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    this.emitState(false, this.fallbackElapsed, this.fallbackDuration);
  }

  private playChordPulse() {
    if (this.isMuted || this.currentVolume <= 0) return;
    try {
      const ctx = this.ensureAudioContext();
      const now = ctx.currentTime;
      const chords = [
        [216, 270, 324, 405],
        [192, 240, 288, 360],
        [172, 216, 259, 324],
      ];
      const chord = chords[Math.floor(Math.random() * chords.length)];
      chord.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.03 * this.currentVolume, now + 0.6);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 3.9);
      });
    } catch {}
  }

  private startProgressLoop() {
    this.stopProgressLoop();
    const tick = () => {
      if (this.howl && this.howl.playing()) {
        this.emitCurrentHowlState(true);
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopProgressLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private emitCurrentHowlState(isPlaying: boolean) {
    if (!this.howl) return;
    const seekVal = this.howl.seek();
    const progress = typeof seekVal === 'number' ? seekVal : 0;
    const duration = this.howl.duration() || this.fallbackDuration;
    this.emitState(isPlaying, progress, duration);
  }

  private emitState(isPlaying: boolean, progress: number, duration: number) {
    if (this.onUpdate) {
      this.onUpdate({ isPlaying, progress, duration });
    }
  }

  private stopAllTrackAudio() {
    this.stopProgressLoop();
    if (this.fallbackTimer !== null) {
      window.clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.howl) {
      this.howl.unload();
      this.howl = null;
    }
  }
}

export const audioEngine = new DVibesAudioEngine();
