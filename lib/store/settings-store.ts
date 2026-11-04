'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  setAmbientStemLevel,
  stopAllAmbientStems,
  type AmbientStemId,
  type TuningHz
} from '@/lib/native/platform';
import { setAudioTuning } from '@/lib/audio-element';

interface SettingsState {
  forceOffline: boolean;
  tuningHz: TuningHz;
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
