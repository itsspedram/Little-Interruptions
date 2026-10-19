import { describe, expect, it } from "vitest";
import { createDefaultSettings, createInitialState } from "./defaults.ts";
import { formatRemaining, getStatus, trayTitle } from "./status.ts";
import type { Settings, State } from "./types.ts";

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 19, 9, 0, 0);

const settings = (change: Partial<Settings> = {}): Settings => ({ ...createDefaultSettings(), intervalMinutes: 60, ...change });
const running = (change: Partial<State> = {}): State => ({ ...createInitialState(), sessionStartedAt: T0, ...change });

describe("getStatus", () => {
  it("is waiting when there is no session", () => {
    expect(getStatus(T0, settings(), createInitialState(), false)).toEqual({ kind: "waiting" });
  });

  it("is waiting when the interval is invalid", () => {
    expect(getStatus(T0, settings({ intervalMinutes: 0 }), running(), false)).toEqual({ kind: "waiting" });
  });

  it("counts down to the next bell", () => {
    const status = getStatus(T0 + 18 * MIN, settings(), running(), false);
    expect(status).toEqual({ kind: "running", nextAt: T0 + 60 * MIN, remainingMs: 42 * MIN, progress: 0.3 });
  });

  it("starts at progress 0 right at a slot", () => {
    const status = getStatus(T0 + 60 * MIN, settings(), running(), false);
    expect(status).toEqual({ kind: "running", nextAt: T0 + 120 * MIN, remainingMs: 60 * MIN, progress: 0 });
  });

  it("is quiet while paused and says when the quiet ends", () => {
    const status = getStatus(T0 + 10 * MIN, settings(), running({ pausedUntil: T0 + 70 * MIN }), false);
    expect(status).toEqual({ kind: "quiet", until: T0 + 70 * MIN, nextAt: T0 + 120 * MIN });
  });

  it("ignores a pause that already ended", () => {
    const status = getStatus(T0 + 80 * MIN, settings(), running({ pausedUntil: T0 + 70 * MIN }), false);
    expect(status.kind).toBe("running");
  });

  it("is held when a bell is waiting for the user to finish", () => {
    expect(getStatus(T0 + 61 * MIN, settings(), running({ deferredRing: true }), true)).toEqual({ kind: "held" });
  });

  it("is busy when smart pause sees the user occupied before a bell is due", () => {
    const status = getStatus(T0 + 18 * MIN, settings(), running(), true);
    expect(status).toEqual({ kind: "running", nextAt: T0 + 60 * MIN, remainingMs: 42 * MIN, progress: 0.3, busy: true });
  });

  it("does not report busy when smart pause is off", () => {
    const status = getStatus(T0 + 18 * MIN, settings({ smartPause: false }), running(), true);
    expect("busy" in status).toBe(false);
  });
});

describe("formatRemaining", () => {
  it("shows minutes rounded up", () => {
    expect(formatRemaining(42 * MIN)).toBe("42m");
    expect(formatRemaining(41 * MIN + 1)).toBe("42m");
  });

  it("shows less than a minute", () => {
    expect(formatRemaining(30_000)).toBe("<1m");
    expect(formatRemaining(0)).toBe("<1m");
    expect(formatRemaining(-5)).toBe("<1m");
  });

  it("switches to hours", () => {
    expect(formatRemaining(60 * MIN)).toBe("1h");
    expect(formatRemaining(62 * MIN)).toBe("1h 2m");
    expect(formatRemaining(150 * MIN)).toBe("2h 30m");
  });
});

describe("trayTitle", () => {
  it("shows the countdown", () => {
    expect(trayTitle({ kind: "running", nextAt: 0, remainingMs: 42 * MIN, progress: 0.3 }, settings())).toBe("42m");
  });

  it("shows a short word for the other states", () => {
    expect(trayTitle({ kind: "quiet", until: 0, nextAt: null }, settings())).toBe("Quiet");
    expect(trayTitle({ kind: "held" }, settings())).toBe("Later");
    expect(trayTitle({ kind: "waiting" }, settings())).toBe("");
  });

  it("shows nothing when the countdown is switched off", () => {
    expect(trayTitle({ kind: "running", nextAt: 0, remainingMs: 42 * MIN, progress: 0.3 }, settings({ showCountdown: false }))).toBe("");
  });
});
