'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  setAmbientStemLevel,
  stopAllAmbientStems,
  type AmbientStemId,
  type TuningHz
} from '@/lib/api/native-bridge';
import { setAudioTuning } from '@/lib/audio-element';

interface SettingsState {
  /** User-forced offline mode: never touch the network, play downloads & local imports only. */
  forceOffline: boolean;
  /** Real playback pitch/tuning frequency (440Hz standard, 432Hz warm sanctuary, 528Hz bright). */
  tuningHz: TuningHz;
  /** Real procedural Web Audio ambient stem levels (0..100). */
  ambientStems: Record<AmbientStemId, number>;

  setForceOffline: (value: boolean) => void;
  toggleForceOffline: () => void;
  setTuningHz: (tuning: TuningHz) => void;
  setAmbientStem: (stem: AmbientStemId, level: number) => void;
  resetAmbientStems: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      forceOffline: false,
      tuningHz: 440,
      ambientStems: {
        rain: 0,
        vinyl: 0,
        fire: 0,
        wind: 0
      },

      setForceOffline: (forceOffline) => set({ forceOffline }),
      toggleForceOffline: () => set({ forceOffline: !get().forceOffline }),

      setTuningHz: (tuningHz) => {
        setAudioTuning(tuningHz);
        set({ tuningHz });
      },

      setAmbientStem: (stem, level) => {
        const clamped = Math.max(0, Math.min(100, Math.round(level)));
        setAmbientStemLevel(stem, clamped / 100);
        set({
          ambientStems: {
            ...get().ambientStems,
            [stem]: clamped
          }
        });
      },

      resetAmbientStems: () => {
        stopAllAmbientStems();
        set({
          ambientStems: {
            rain: 0,
            vinyl: 0,
            fire: 0,
            wind: 0
          }
        });
      }
    }),
    {
      name: 'dvibes-settings-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        forceOffline: state.forceOffline,
        tuningHz: state.tuningHz
      })
    }
  )
);
