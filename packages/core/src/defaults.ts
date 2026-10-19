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
    showCountdown: true,
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
  };
}
