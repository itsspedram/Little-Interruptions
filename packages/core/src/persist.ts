import { createDefaultSettings, createInitialState } from "./defaults.ts";
import { isRecord, isWholeMinutes } from "./validate.ts";
import { DISPLAY_STYLES, REGULAR_CATEGORIES } from "./types.ts";
import type { DisplayStyle, Settings, State } from "./types.ts";

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

  const {
    intervalMinutes,
    idleMinutes,
    enabledPacks,
    autoUpdatePacks,
    soundEnabled,
    smartPause,
    smartPauseMic,
    launchAtLogin,
    showCountdown,
    enabledCategories,
    displayStyle,
    welcomeBack,
    welcomeAfterMinutes,
    onboarded,
  } = input;
  const knownCategories = isStringList(enabledCategories)
    ? REGULAR_CATEGORIES.filter((category) => enabledCategories.includes(category))
    : [];
  return {
    version: 1,
    intervalMinutes: isWholeMinutes(intervalMinutes) ? intervalMinutes : defaults.intervalMinutes,
    idleMinutes: isWholeMinutes(idleMinutes) ? idleMinutes : defaults.idleMinutes,
    enabledPacks: isStringList(enabledPacks) ? [...enabledPacks] : defaults.enabledPacks,
    autoUpdatePacks: typeof autoUpdatePacks === "boolean" ? autoUpdatePacks : defaults.autoUpdatePacks,
    soundEnabled: typeof soundEnabled === "boolean" ? soundEnabled : defaults.soundEnabled,
    smartPause: typeof smartPause === "boolean" ? smartPause : defaults.smartPause,
    smartPauseMic: typeof smartPauseMic === "boolean" ? smartPauseMic : defaults.smartPauseMic,
    launchAtLogin: typeof launchAtLogin === "boolean" ? launchAtLogin : defaults.launchAtLogin,
    showCountdown: typeof showCountdown === "boolean" ? showCountdown : defaults.showCountdown,
    enabledCategories: knownCategories.length > 0 ? knownCategories : defaults.enabledCategories,
    displayStyle: (DISPLAY_STYLES as readonly unknown[]).includes(displayStyle)
      ? (displayStyle as DisplayStyle)
      : defaults.displayStyle,
    welcomeBack: typeof welcomeBack === "boolean" ? welcomeBack : defaults.welcomeBack,
    welcomeAfterMinutes: isWholeMinutes(welcomeAfterMinutes) ? welcomeAfterMinutes : defaults.welcomeAfterMinutes,
    onboarded: onboarded === true,
  };
}

/** Same idea for saved state: damaged fields reset, nothing throws. */
export function parseState(input: unknown): State {
  const initial = createInitialState();
  if (!isRecord(input)) return initial;

  const { sessionStartedAt, pausedUntil, bag, lastPackCheckAt, deferredRing, lastActiveAt } = input;
  return {
    version: 1,
    sessionStartedAt: isTimestamp(sessionStartedAt) ? sessionStartedAt : null,
    pausedUntil: isTimestamp(pausedUntil) ? pausedUntil : null,
    bag: isStringList(bag) ? [...bag] : initial.bag,
    lastPackCheckAt: isTimestamp(lastPackCheckAt) ? lastPackCheckAt : null,
    deferredRing: deferredRing === true,
    lastActiveAt: isTimestamp(lastActiveAt) ? lastActiveAt : null,
  };
}
