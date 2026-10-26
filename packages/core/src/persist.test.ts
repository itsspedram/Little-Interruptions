import { describe, expect, it } from "vitest";
import { createDefaultSettings, createInitialState } from "./defaults.ts";
import { parseSettings, parseState } from "./persist.ts";
import { validateSettings } from "./validate.ts";
import type { Settings, State } from "./types.ts";

describe("parseSettings", () => {
  it("returns the defaults for something that is not an object", () => {
    expect(parseSettings(null)).toEqual(createDefaultSettings());
    expect(parseSettings("nope")).toEqual(createDefaultSettings());
    expect(parseSettings([1, 2])).toEqual(createDefaultSettings());
  });

  it("keeps valid saved settings as they are", () => {
    const saved: Settings = {
      version: 1,
      intervalMinutes: 90,
      idleMinutes: 10,
      enabledPacks: ["Little Interruptions", "Other"],
      autoUpdatePacks: false,
      soundEnabled: false,
      smartPause: false,
      smartPauseMic: false,
      launchAtLogin: false,
      showCountdown: false,
      enabledCategories: ["playful_weird"],
      displayStyle: "overlay",
      welcomeBack: false,
      welcomeAfterMinutes: 240,
      onboarded: true,
    };
    expect(parseSettings(saved)).toEqual(saved);
  });

  it("keeps a saved microphone choice and defaults a missing or invalid one to on", () => {
    expect(parseSettings({ smartPauseMic: false }).smartPauseMic).toBe(false);
    expect(parseSettings({}).smartPauseMic).toBe(true);
    expect(parseSettings({ smartPauseMic: "no" }).smartPauseMic).toBe(true);
  });

  it("keeps a saved launch-at-login choice and defaults a missing or invalid one to on", () => {
    expect(parseSettings({ launchAtLogin: false }).launchAtLogin).toBe(false);
    expect(parseSettings({}).launchAtLogin).toBe(true);
    expect(parseSettings({ launchAtLogin: 0 }).launchAtLogin).toBe(true);
  });

  it("falls back to all kinds when no known message kind is saved", () => {
    const all = createDefaultSettings().enabledCategories;
    expect(parseSettings({ enabledCategories: [] }).enabledCategories).toEqual(all);
    expect(parseSettings({ enabledCategories: ["nonsense"] }).enabledCategories).toEqual(all);
    expect(parseSettings({ enabledCategories: "playful_weird" }).enabledCategories).toEqual(all);
  });

  it("keeps only known message kinds, in a fixed order", () => {
    const result = parseSettings({ enabledCategories: ["tiny_mindfulness", "welcome_back", "gentle_caring", "x"] });
    expect(result.enabledCategories).toEqual(["gentle_caring", "tiny_mindfulness"]);
  });

  it("replaces an unknown display style and treats a missing onboarded as not done", () => {
    const result = parseSettings({ displayStyle: "hologram", onboarded: "yes" });
    expect(result.displayStyle).toBe("card");
    expect(result.onboarded).toBe(false);
  });

  it("fills in fields that an older version never saved", () => {
    const result = parseSettings({ version: 1, intervalMinutes: 90 });
    expect(result.intervalMinutes).toBe(90);
    expect(result.soundEnabled).toBe(true);
    expect(result.autoUpdatePacks).toBe(true);
    expect(result.smartPause).toBe(true);
    expect(result.showCountdown).toBe(true);
  });

  it("replaces only the invalid field with its default", () => {
    const result = parseSettings({ ...createDefaultSettings(), intervalMinutes: 0, idleMinutes: 10 });
    expect(result.intervalMinutes).toBe(createDefaultSettings().intervalMinutes);
    expect(result.idleMinutes).toBe(10);
  });

  it("drops unknown fields", () => {
    const result = parseSettings({ ...createDefaultSettings(), sneaky: true });
    expect(Object.keys(result).sort()).toEqual([
      "autoUpdatePacks",
      "displayStyle",
      "enabledCategories",
      "enabledPacks",
      "idleMinutes",
      "intervalMinutes",
      "launchAtLogin",
      "onboarded",
      "showCountdown",
      "smartPause",
      "smartPauseMic",
      "soundEnabled",
      "version",
      "welcomeAfterMinutes",
      "welcomeBack",
    ]);
  });

  it("always returns something validateSettings accepts", () => {
    const garbage: unknown[] = [
      undefined,
      42,
      {},
      { intervalMinutes: "60", idleMinutes: -1, enabledPacks: [1, 2], autoUpdatePacks: "yes", soundEnabled: 0, smartPause: "on", showCountdown: 1 },
      { intervalMinutes: Number.NaN, idleMinutes: Number.POSITIVE_INFINITY },
    ];
    for (const input of garbage) {
      expect(validateSettings(parseSettings(input))).toEqual([]);
    }
  });

  it("copies the enabledPacks list instead of sharing it", () => {
    const input = { ...createDefaultSettings(), enabledPacks: ["A"] };
    const result = parseSettings(input);
    result.enabledPacks.push("B");
    expect(input.enabledPacks).toEqual(["A"]);
  });
});

describe("parseState", () => {
  it("returns the initial state for something that is not an object", () => {
    expect(parseState(null)).toEqual(createInitialState());
    expect(parseState(7)).toEqual(createInitialState());
  });

  it("keeps a valid saved state as it is", () => {
    const saved: State = {
      version: 1,
      sessionStartedAt: 1_700_000_000_000,
      pausedUntil: 1_700_000_900_000,
      bag: ["li-003", "li-011"],
      lastPackCheckAt: 1_699_999_000_000,
      deferredRing: true,
      lastActiveAt: 1_700_000_500_000,
    };
    expect(parseState(saved)).toEqual(saved);
  });

  it("replaces invalid fields one by one", () => {
    const result = parseState({
      version: 1,
      sessionStartedAt: "yesterday",
      pausedUntil: 1_700_000_900_000,
      bag: ["ok", 5],
      lastPackCheckAt: Number.NaN,
    });
    expect(result.sessionStartedAt).toBeNull();
    expect(result.pausedUntil).toBe(1_700_000_900_000);
    expect(result.bag).toEqual([]);
    expect(result.lastPackCheckAt).toBeNull();
  });

  it("drops unknown fields", () => {
    const result = parseState({ ...createInitialState(), sneaky: true });
    expect(Object.keys(result).sort()).toEqual([
      "bag",
      "deferredRing",
      "lastActiveAt",
      "lastPackCheckAt",
      "pausedUntil",
      "sessionStartedAt",
      "version",
    ]);
  });

  it("treats a missing or invalid deferredRing as false", () => {
    expect(parseState({ version: 1 }).deferredRing).toBe(false);
    expect(parseState({ version: 1, deferredRing: "yes" }).deferredRing).toBe(false);
  });

  it("copies the bag instead of sharing it", () => {
    const input = { ...createInitialState(), bag: ["a"] };
    const result = parseState(input);
    result.bag.push("b");
    expect(input.bag).toEqual(["a"]);
  });
});
