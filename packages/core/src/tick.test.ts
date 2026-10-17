import { describe, expect, it } from "vitest";
import { createDefaultSettings, createInitialState } from "./defaults.ts";
import { onTick } from "./tick.ts";
import type { Settings, State } from "./types.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 9, 17, 9, 0, 0);

const settings = (change: Partial<Settings> = {}): Settings => ({
  ...createDefaultSettings(),
  intervalMinutes: 60,
  idleMinutes: 5,
  ...change,
});

const running = (start: number, change: Partial<State> = {}): State => ({
  ...createInitialState(),
  sessionStartedAt: start,
  ...change,
});

describe("starting and ending sessions", () => {
  it("starts a session when the user is active and none is running", () => {
    const result = onTick({ now: T0, idleSeconds: 2, gapMs: 5000 }, settings(), createInitialState());
    expect(result.state.sessionStartedAt).toBe(T0);
    expect(result.ring).toBe(false);
  });

  it("does not start a session while the user is idle", () => {
    const result = onTick({ now: T0, idleSeconds: 600, gapMs: 5000 }, settings(), createInitialState());
    expect(result.state.sessionStartedAt).toBeNull();
  });

  it("does not start a session when the last input was a little while ago", () => {
    const result = onTick({ now: T0, idleSeconds: 20, gapMs: 5000 }, settings(), createInitialState());
    expect(result.state.sessionStartedAt).toBeNull();
  });

  it("keeps a running session while the user stays active", () => {
    const result = onTick({ now: T0 + 10 * MIN, idleSeconds: 3, gapMs: 5000 }, settings(), running(T0));
    expect(result.state.sessionStartedAt).toBe(T0);
  });

  it("ends the session once the user has been idle for the threshold", () => {
    const result = onTick({ now: T0 + 30 * MIN, idleSeconds: 300, gapMs: 5000 }, settings(), running(T0));
    expect(result.state.sessionStartedAt).toBeNull();
    expect(result.ring).toBe(false);
  });

  it("keeps the session just below the idle threshold", () => {
    const result = onTick({ now: T0 + 30 * MIN, idleSeconds: 299, gapMs: 5000 }, settings(), running(T0));
    expect(result.state.sessionStartedAt).toBe(T0);
  });

  it("starts a fresh session when the user comes back after being idle", () => {
    const idle = onTick({ now: T0 + 30 * MIN, idleSeconds: 600, gapMs: 5000 }, settings(), running(T0));
    const back = onTick({ now: T0 + 40 * MIN, idleSeconds: 1, gapMs: 5000 }, settings(), idle.state);
    expect(back.state.sessionStartedAt).toBe(T0 + 40 * MIN);
    expect(back.ring).toBe(false);
  });

  it("treats a long gap between ticks as sleep and starts a fresh session if the user is back", () => {
    const result = onTick({ now: T0 + 8 * HOUR, idleSeconds: 1, gapMs: 8 * HOUR }, settings(), running(T0));
    expect(result.state.sessionStartedAt).toBe(T0 + 8 * HOUR);
    expect(result.ring).toBe(false);
  });

  it("after sleep, waits for the user before starting a session", () => {
    const result = onTick({ now: T0 + 8 * HOUR, idleSeconds: 600, gapMs: 8 * HOUR }, settings(), running(T0));
    expect(result.state.sessionStartedAt).toBeNull();
    expect(result.ring).toBe(false);
  });

  it("does not change the state it is given", () => {
    const original = running(T0);
    onTick({ now: T0 + 30 * MIN, idleSeconds: 600, gapMs: 5000 }, settings(), original);
    expect(original.sessionStartedAt).toBe(T0);
  });
});

describe("ringing", () => {
  it("rings in the tick during which a slot passes", () => {
    const result = onTick({ now: T0 + 60 * MIN, idleSeconds: 0, gapMs: 5000 }, settings(), running(T0));
    expect(result.ring).toBe(true);
    expect(result.state.sessionStartedAt).toBe(T0);
  });

  it("does not ring before the slot", () => {
    const result = onTick({ now: T0 + 59 * MIN, idleSeconds: 0, gapMs: 5000 }, settings(), running(T0));
    expect(result.ring).toBe(false);
  });

  it("rings only once per slot", () => {
    const result = onTick({ now: T0 + 60 * MIN + 5000, idleSeconds: 0, gapMs: 5000 }, settings(), running(T0));
    expect(result.ring).toBe(false);
  });

  it("rings again at the next slot", () => {
    const result = onTick({ now: T0 + 120 * MIN, idleSeconds: 0, gapMs: 5000 }, settings(), running(T0));
    expect(result.ring).toBe(true);
  });

  it("never rings on the very first tick", () => {
    const result = onTick({ now: T0 + 60 * MIN, idleSeconds: 0, gapMs: 0 }, settings(), running(T0));
    expect(result.ring).toBe(false);
  });

  it("does not ring while paused", () => {
    const state = running(T0, { pausedUntil: T0 + 90 * MIN });
    const result = onTick({ now: T0 + 60 * MIN, idleSeconds: 0, gapMs: 5000 }, settings(), state);
    expect(result.ring).toBe(false);
  });

  it("rings at the first slot after a pause ends", () => {
    const state = running(T0, { pausedUntil: T0 + 90 * MIN });
    const result = onTick({ now: T0 + 120 * MIN, idleSeconds: 0, gapMs: 5000 }, settings(), state);
    expect(result.ring).toBe(true);
  });

  it("does not ring when the interval is invalid", () => {
    const result = onTick({ now: T0 + 60 * MIN, idleSeconds: 0, gapMs: 5000 }, settings({ intervalMinutes: 0 }), running(T0));
    expect(result.ring).toBe(false);
  });

  it("does not ring in the tick where a session restarts after sleep", () => {
    // 8 hours asleep would span several slots, but none of them may replay.
    const result = onTick({ now: T0 + 8 * HOUR, idleSeconds: 0, gapMs: 8 * HOUR }, settings(), running(T0));
    expect(result.ring).toBe(false);
  });
});
