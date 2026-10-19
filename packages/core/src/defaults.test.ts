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

  it("starts with no session, no pause, an empty bag and no update check", () => {
    expect(createInitialState()).toEqual({
      version: 1,
      sessionStartedAt: null,
      pausedUntil: null,
      bag: [],
      lastPackCheckAt: null,
      deferredRing: false,
    });
  });

  it("gives every caller its own objects", () => {
    createDefaultSettings().enabledPacks.push("Mutated");
    createInitialState().bag.push("mutated");
    expect(createDefaultSettings().enabledPacks).toHaveLength(1);
    expect(createInitialState().bag).toEqual([]);
  });
});
