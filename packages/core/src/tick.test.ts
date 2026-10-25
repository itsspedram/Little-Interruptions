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

describe("smart pause", () => {
  const AT_SLOT = T0 + 60 * MIN;
  const tick = (now: number, busy: boolean | undefined, change: Partial<Settings> = {}, state: State = running(T0)) =>
    onTick(busy === undefined ? { now, idleSeconds: 0, gapMs: 5000 } : { now, idleSeconds: 0, gapMs: 5000, busy }, settings(change), state);

  it("holds a bell that falls due while the user is busy", () => {
    const result = tick(AT_SLOT, true);
    expect(result.ring).toBe(false);
    expect(result.state.deferredRing).toBe(true);
  });

  it("rings once the user stops being busy", () => {
    const held = tick(AT_SLOT, true);
    const free = tick(AT_SLOT + 5 * MIN, false, {}, held.state);
    expect(free.ring).toBe(true);
    expect(free.state.deferredRing).toBe(false);
  });

  it("keeps holding while the user stays busy", () => {
    const held = tick(AT_SLOT, true);
    const still = tick(AT_SLOT + 5 * MIN, true, {}, held.state);
    expect(still.ring).toBe(false);
    expect(still.state.deferredRing).toBe(true);
  });

  it("rings only once after the busy stretch ends", () => {
    const held = tick(AT_SLOT, true);
    const free = tick(AT_SLOT + 5 * MIN, false, {}, held.state);
    const after = tick(AT_SLOT + 5 * MIN + 5000, false, {}, free.state);
    expect(after.ring).toBe(false);
  });

  it("rings once, not twice, when a busy stretch spans two slots", () => {
    const first = tick(AT_SLOT, true);
    const second = tick(T0 + 120 * MIN, true, {}, first.state);
    expect(second.ring).toBe(false);
    const free = tick(T0 + 130 * MIN, false, {}, second.state);
    expect(free.ring).toBe(true);
    const after = tick(T0 + 130 * MIN + 5000, false, {}, free.state);
    expect(after.ring).toBe(false);
  });

  it("ignores busy when smart pause is off", () => {
    const result = tick(AT_SLOT, true, { smartPause: false });
    expect(result.ring).toBe(true);
    expect(result.state.deferredRing).toBe(false);
  });

  it("rings a held bell if smart pause is switched off meanwhile", () => {
    const held = tick(AT_SLOT, true);
    const result = tick(AT_SLOT + MIN, true, { smartPause: false }, held.state);
    expect(result.ring).toBe(true);
    expect(result.state.deferredRing).toBe(false);
  });

  it("holds nothing when no bell is due", () => {
    const result = tick(T0 + 10 * MIN, true);
    expect(result.ring).toBe(false);
    expect(result.state.deferredRing).toBe(false);
  });

  it("treats a missing busy flag as not busy", () => {
    expect(tick(AT_SLOT, undefined).ring).toBe(true);
  });

  it("drops a held bell when the user goes idle and the session ends", () => {
    const held = tick(AT_SLOT, true);
    const result = onTick({ now: AT_SLOT + 30 * MIN, idleSeconds: 600, gapMs: 5000, busy: false }, settings(), held.state);
    expect(result.state.sessionStartedAt).toBeNull();
    expect(result.state.deferredRing).toBe(false);
    expect(result.ring).toBe(false);
  });

  it("drops a held bell after sleep", () => {
    const held = tick(AT_SLOT, true);
    const result = onTick({ now: AT_SLOT + 8 * HOUR, idleSeconds: 1, gapMs: 8 * HOUR, busy: false }, settings(), held.state);
    expect(result.ring).toBe(false);
    expect(result.state.deferredRing).toBe(false);
  });

  it("drops a held bell when the user asks for quiet", () => {
    const held = tick(AT_SLOT, true);
    const quiet: State = { ...held.state, pausedUntil: AT_SLOT + 3 * HOUR };
    const result = tick(AT_SLOT + MIN, false, {}, quiet);
    expect(result.ring).toBe(false);
    expect(result.state.deferredRing).toBe(false);
  });
});

describe("welcome back", () => {
  const HOURS = (n: number) => n * HOUR;
  const seen = (at: number, change: Partial<State> = {}) => ({ ...createInitialState(), lastActiveAt: at, ...change });

  it("welcomes the user after an absence of at least the threshold", () => {
    const result = onTick({ now: T0 + HOURS(3), idleSeconds: 1, gapMs: 5000 }, settings(), seen(T0));
    expect(result.welcome).toBe(true);
    expect(result.state.lastActiveAt).toBe(T0 + HOURS(3));
    expect(result.state.sessionStartedAt).toBe(T0 + HOURS(3));
  });

  it("does not welcome after a shorter absence", () => {
    const result = onTick({ now: T0 + HOURS(3) - 1, idleSeconds: 1, gapMs: 5000 }, settings(), seen(T0));
    expect(result.welcome).toBe(false);
  });

  it("waits until the user is really back, not just a tick of the clock", () => {
    const state = seen(T0);
    const idle = onTick({ now: T0 + HOURS(5), idleSeconds: 600, gapMs: 5000 }, settings(), state);
    expect(idle.welcome).toBe(false);
    expect(idle.state.lastActiveAt).toBe(T0);
    const back = onTick({ now: T0 + HOURS(5) + 5000, idleSeconds: 1, gapMs: 5000 }, settings(), idle.state);
    expect(back.welcome).toBe(true);
  });

  it("greets only once per return", () => {
    const first = onTick({ now: T0 + HOURS(4), idleSeconds: 1, gapMs: 5000 }, settings(), seen(T0));
    const second = onTick({ now: T0 + HOURS(4) + 5000, idleSeconds: 1, gapMs: 5000 }, settings(), first.state);
    expect(first.welcome).toBe(true);
    expect(second.welcome).toBe(false);
  });

  it("never welcomes on the very first run", () => {
    const result = onTick({ now: T0, idleSeconds: 1, gapMs: 0 }, settings(), createInitialState());
    expect(result.welcome).toBe(false);
    expect(result.state.lastActiveAt).toBe(T0);
  });

  it("respects the switch and the custom threshold", () => {
    const off = onTick({ now: T0 + HOURS(9), idleSeconds: 1, gapMs: 5000 }, settings({ welcomeBack: false }), seen(T0));
    expect(off.welcome).toBe(false);
    expect(off.state.lastActiveAt).toBe(T0 + HOURS(9));
    const custom = onTick({ now: T0 + HOURS(1), idleSeconds: 1, gapMs: 5000 }, settings({ welcomeAfterMinutes: 60 }), seen(T0));
    expect(custom.welcome).toBe(true);
  });

  it("never treats an absence shorter than the idle limit as a return", () => {
    const result = onTick(
      { now: T0 + 4 * MIN, idleSeconds: 1, gapMs: 5000 },
      settings({ welcomeAfterMinutes: 1, idleMinutes: 5 }),
      seen(T0),
    );
    expect(result.welcome).toBe(false);
  });

  it("refreshes last-seen at most once a minute while the user keeps working", () => {
    const first = onTick({ now: T0, idleSeconds: 1, gapMs: 5000 }, settings(), seen(T0));
    expect(first.state).toBe(first.state);
    const soon = onTick({ now: T0 + 30_000, idleSeconds: 1, gapMs: 5000 }, settings(), seen(T0));
    expect(soon.state.lastActiveAt).toBe(T0);
    const later = onTick({ now: T0 + 60_000, idleSeconds: 1, gapMs: 5000 }, settings(), seen(T0));
    expect(later.state.lastActiveAt).toBe(T0 + 60_000);
  });

  it("recovers when the clock moves backwards", () => {
    const result = onTick({ now: T0, idleSeconds: 1, gapMs: 5000 }, settings(), seen(T0 + HOURS(10)));
    expect(result.welcome).toBe(false);
    expect(result.state.lastActiveAt).toBe(T0);
  });

  it("does not ring at the moment of a welcome", () => {
    const state = running(T0, { lastActiveAt: T0, deferredRing: false });
    // the user left right after T0 and comes back exactly on a slot, 3 hours later
    const result = onTick({ now: T0 + HOURS(3), idleSeconds: 1, gapMs: 5000 }, settings(), state);
    expect(result.welcome).toBe(true);
    expect(result.ring).toBe(false);
  });
});
