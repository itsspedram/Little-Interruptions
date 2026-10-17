import { describe, expect, it } from "vitest";
import { createDefaultSettings, createInitialState } from "./defaults.ts";
import {
  endSession,
  isSessionExpired,
  nextFireTime,
  pauseUntil,
  resume,
  startSession,
} from "./schedule.ts";
import type { Settings, State } from "./types.ts";

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 17, 9, 0, 0); // arbitrary session start

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...createDefaultSettings(), ...overrides };
}

function sessionAt(start: number, overrides: Partial<State> = {}): State {
  return { ...createInitialState(), sessionStartedAt: start, ...overrides };
}

describe("session lifecycle", () => {
  it("startSession records the start time", () => {
    const state = startSession(createInitialState(), T0);
    expect(state.sessionStartedAt).toBe(T0);
  });

  it("startSession keeps the original start when a session is already running", () => {
    const running = sessionAt(T0);
    const again = startSession(running, T0 + 30 * MIN);
    expect(again.sessionStartedAt).toBe(T0);
  });

  it("endSession clears the session but keeps the shuffle bag", () => {
    const ended = endSession(sessionAt(T0, { bag: ["li-001"] }));
    expect(ended.sessionStartedAt).toBeNull();
    expect(ended.bag).toEqual(["li-001"]);
  });

  it("does not mutate the state it is given", () => {
    const original = createInitialState();
    startSession(original, T0);
    expect(original.sessionStartedAt).toBeNull();
  });
});

describe("nextFireTime", () => {
  it("is null when there is no active session", () => {
    expect(nextFireTime(T0, settings(), createInitialState())).toBeNull();
  });

  it("rings one full interval after the session starts, not at the start", () => {
    expect(nextFireTime(T0, settings({ intervalMinutes: 60 }), sessionAt(T0))).toBe(T0 + 60 * MIN);
  });

  it("returns the upcoming slot in the middle of an interval", () => {
    expect(nextFireTime(T0 + 10 * MIN, settings({ intervalMinutes: 60 }), sessionAt(T0))).toBe(
      T0 + 60 * MIN,
    );
  });

  it("moves to the following slot when now is exactly on a slot", () => {
    expect(nextFireTime(T0 + 60 * MIN, settings({ intervalMinutes: 60 }), sessionAt(T0))).toBe(
      T0 + 120 * MIN,
    );
  });

  it("keeps a steady grid over a long session (90 minute interval)", () => {
    // slots at 90, 180, 270, 360 minutes; now is 1 ms past the 300 minute mark
    expect(nextFireTime(T0 + 300 * MIN + 1, settings({ intervalMinutes: 90 }), sessionAt(T0))).toBe(
      T0 + 360 * MIN,
    );
  });

  it("supports a custom interval that does not divide the hour", () => {
    // slots at 45, 90, 135
    expect(nextFireTime(T0 + 100 * MIN, settings({ intervalMinutes: 45 }), sessionAt(T0))).toBe(
      T0 + 135 * MIN,
    );
  });

  it("skips missed slots instead of replaying them", () => {
    // The shell never ended the session and 10 hours passed: next slot is in the future.
    expect(nextFireTime(T0 + 600 * MIN, settings({ intervalMinutes: 120 }), sessionAt(T0))).toBe(
      T0 + 720 * MIN,
    );
  });

  it("still rings one interval after start if now is before the start (clock skew)", () => {
    expect(nextFireTime(T0 - 5 * MIN, settings({ intervalMinutes: 60 }), sessionAt(T0))).toBe(
      T0 + 60 * MIN,
    );
  });

  it("is null for an interval that cannot work", () => {
    const state = sessionAt(T0);
    expect(nextFireTime(T0, settings({ intervalMinutes: 0 }), state)).toBeNull();
    expect(nextFireTime(T0, settings({ intervalMinutes: -30 }), state)).toBeNull();
    expect(nextFireTime(T0, settings({ intervalMinutes: Number.NaN }), state)).toBeNull();
    expect(nextFireTime(T0, settings({ intervalMinutes: 1.5 }), state)).toBeNull();
  });
});

describe("pause and snooze", () => {
  it("pauseUntil stores the moment and resume clears it", () => {
    const paused = pauseUntil(sessionAt(T0), T0 + 90 * MIN);
    expect(paused.pausedUntil).toBe(T0 + 90 * MIN);
    expect(resume(paused).pausedUntil).toBeNull();
  });

  it("rings at the first slot at or after the pause ends", () => {
    // slots at 60, 120; pause ends at 100 minutes, between two slots
    const state = sessionAt(T0, { pausedUntil: T0 + 100 * MIN });
    expect(nextFireTime(T0 + 10 * MIN, settings({ intervalMinutes: 60 }), state)).toBe(T0 + 120 * MIN);
  });

  it("allows a ring exactly when the pause ends", () => {
    const state = sessionAt(T0, { pausedUntil: T0 + 120 * MIN });
    expect(nextFireTime(T0 + 10 * MIN, settings({ intervalMinutes: 60 }), state)).toBe(T0 + 120 * MIN);
  });

  it("ignores a pause that is already over", () => {
    const state = sessionAt(T0, { pausedUntil: T0 + 5 * MIN });
    expect(nextFireTime(T0 + 10 * MIN, settings({ intervalMinutes: 60 }), state)).toBe(T0 + 60 * MIN);
  });

  it("does not make a pause shorter than the next slot ring early", () => {
    const state = sessionAt(T0, { pausedUntil: T0 + 20 * MIN });
    expect(nextFireTime(T0 + 10 * MIN, settings({ intervalMinutes: 60 }), state)).toBe(T0 + 60 * MIN);
  });
});

describe("isSessionExpired", () => {
  const s = settings({ idleMinutes: 5 });

  it("is false just before the idle threshold", () => {
    expect(isSessionExpired(T0 + 5 * MIN - 1, T0, s)).toBe(false);
  });

  it("is true at the idle threshold", () => {
    expect(isSessionExpired(T0 + 5 * MIN, T0, s)).toBe(true);
  });

  it("is true well past the threshold", () => {
    expect(isSessionExpired(T0 + 90 * MIN, T0, s)).toBe(true);
  });
});
