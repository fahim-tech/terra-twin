import { create } from "zustand";
import type { Planet } from "../globes/protocol";

/**
 * Phones show one planet at a time in the comparison. The shell's "Globe shown" switch (App.tsx) and the 3D relief's
 * own Mars / Earth switch read and write this one value, so the globe and the relief always show the same planet.
 */
export const usePhonePlanet = create<{ planet: Planet; setPlanet: (p: Planet) => void }>((set) => ({
  planet: "earth",
  setPlanet: (planet) => set({ planet }),
}));
