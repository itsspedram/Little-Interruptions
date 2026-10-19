import { createDefaultSettings, createInitialState } from "./defaults.ts";
import { isRecord, isWholeMinutes } from "./validate.ts";
import type { Settings, State } from "./types.ts";

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Read settings saved by this or an older version of the app. Never fails:
 * every field that is missing or invalid falls back to its default, so a
 * damaged file cannot stop the app from starting. Unknown fields are dropped.
 */
export function parseSettings(input: unknown): Settings {
  const defaults = createDefaultSettings();
  if (!isRecord(input)) return defaults;

  const { intervalMinutes, idleMinutes, enabledPacks, autoUpdatePacks, soundEnabled, smartPause, showCountdown } = input;
  return {
    version: 1,
    intervalMinutes: isWholeMinutes(intervalMinutes) ? intervalMinutes : defaults.intervalMinutes,
    idleMinutes: isWholeMinutes(idleMinutes) ? idleMinutes : defaults.idleMinutes,
    enabledPacks: isStringList(enabledPacks) ? [...enabledPacks] : defaults.enabledPacks,
    autoUpdatePacks: typeof autoUpdatePacks === "boolean" ? autoUpdatePacks : defaults.autoUpdatePacks,
    soundEnabled: typeof soundEnabled === "boolean" ? soundEnabled : defaults.soundEnabled,
    smartPause: typeof smartPause === "boolean" ? smartPause : defaults.smartPause,
    showCountdown: typeof showCountdown === "boolean" ? showCountdown : defaults.showCountdown,
  };
}

/** Same idea for saved state: damaged fields reset, nothing throws. */
export function parseState(input: unknown): State {
  const initial = createInitialState();
  if (!isRecord(input)) return initial;

  const { sessionStartedAt, pausedUntil, bag, lastPackCheckAt, deferredRing } = input;
  return {
    version: 1,
    sessionStartedAt: isTimestamp(sessionStartedAt) ? sessionStartedAt : null,
    pausedUntil: isTimestamp(pausedUntil) ? pausedUntil : null,
    bag: isStringList(bag) ? [...bag] : initial.bag,
    lastPackCheckAt: isTimestamp(lastPackCheckAt) ? lastPackCheckAt : null,
    deferredRing: deferredRing === true,
  };
}
