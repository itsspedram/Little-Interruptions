import { REGULAR_CATEGORIES } from "./types.ts";
import type { Settings, State } from "./types.ts";

export const DEFAULT_PACK = "Little Interruptions";

export function createDefaultSettings(): Settings {
  return {
    version: 1,
    intervalMinutes: 60,
    idleMinutes: 5,
    enabledPacks: [DEFAULT_PACK],
    autoUpdatePacks: true,
    soundEnabled: true,
    smartPause: true,
    smartPauseMic: true,
    showCountdown: true,
    enabledCategories: [...REGULAR_CATEGORIES],
    displayStyle: "card",
    welcomeBack: true,
    welcomeAfterMinutes: 180,
    onboarded: false,
  };
}

export function createInitialState(): State {
  return {
    version: 1,
    sessionStartedAt: null,
    pausedUntil: null,
    bag: [],
    lastPackCheckAt: null,
    deferredRing: false,
    lastActiveAt: null,
  };
}
