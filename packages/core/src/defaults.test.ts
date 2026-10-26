import { describe, expect, it } from "vitest";
import { createDefaultSettings, createInitialState } from "./defaults.ts";
import { validateSettings } from "./validate.ts";

describe("defaults", () => {
  it("default settings pass validation", () => {
    expect(validateSettings(createDefaultSettings())).toEqual([]);
  });

  it("turns sound on by default", () => {
    expect(createDefaultSettings().soundEnabled).toBe(true);
  });

  it("turns smart pause and the menu bar countdown on by default", () => {
    expect(createDefaultSettings().smartPause).toBe(true);
    expect(createDefaultSettings().showCountdown).toBe(true);
  });

  it("also waits for a microphone in use by default", () => {
    expect(createDefaultSettings().smartPauseMic).toBe(true);
  });

  it("shows all regular message kinds, the card style and a welcome after 3 hours by default", () => {
    const settings = createDefaultSettings();
    expect(settings.enabledCategories).toEqual(["gentle_caring", "playful_weird", "tiny_mindfulness"]);
    expect(settings.displayStyle).toBe("card");
    expect(settings.welcomeBack).toBe(true);
    expect(settings.welcomeAfterMinutes).toBe(180);
    expect(settings.onboarded).toBe(false);
  });

  it("starts with no session, no pause, an empty bag and no update check", () => {
    expect(createInitialState()).toEqual({
      version: 1,
      sessionStartedAt: null,
      pausedUntil: null,
      bag: [],
      lastPackCheckAt: null,
      deferredRing: false,
      lastActiveAt: null,
    });
  });

  it("gives every caller its own objects", () => {
    createDefaultSettings().enabledPacks.push("Mutated");
    createInitialState().bag.push("mutated");
    expect(createDefaultSettings().enabledPacks).toHaveLength(1);
    expect(createInitialState().bag).toEqual([]);
  });
});
