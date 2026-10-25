import type { Settings, State } from "./types.ts";

const MS_PER_MINUTE = 60_000;

/** Begin a session. If one is already running its start time is kept. */
export function startSession(state: State, now: number): State {
  if (state.sessionStartedAt !== null) return state;
  return { ...state, sessionStartedAt: now };
}

/** End the session (idle, lock, sleep). The shuffle bag and any pause survive; a held bell does not. */
export function endSession(state: State): State {
  return { ...state, sessionStartedAt: null, deferredRing: false };
}

export function pauseUntil(state: State, until: number): State {
  return { ...state, pausedUntil: until };
}

export function resume(state: State): State {
  return { ...state, pausedUntil: null };
}

/**
 * The next moment a bell should ring, or null if none should.
 *
 * Bells sit on a grid anchored to the session start: start + k * interval, k >= 1.
 * The result is always strictly after `now` (missed slots are skipped, never replayed)
 * and never before `pausedUntil`.
 */
export function nextFireTime(now: number, settings: Settings, state: State): number | null {
  const start = state.sessionStartedAt;
  if (start === null) return null;

  const { intervalMinutes } = settings;
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) return null;

  const interval = intervalMinutes * MS_PER_MINUTE;
  let slot = Math.max(1, Math.floor((now - start) / interval) + 1);
  let time = start + slot * interval;

  const pausedUntil = state.pausedUntil;
  if (pausedUntil !== null && time < pausedUntil) {
    slot = Math.ceil((pausedUntil - start) / interval);
    time = start + slot * interval;
  }
  return time;
}

/** True once the user has been inactive for at least `idleMinutes`. */
export function isSessionExpired(now: number, lastActivityAt: number, settings: Settings): boolean {
  return now - lastActivityAt >= settings.idleMinutes * MS_PER_MINUTE;
}

/** Skip the next bell only: stay quiet until just past it, then carry on with the normal grid. */
export function skipNext(now: number, settings: Settings, state: State): State {
  const next = nextFireTime(now, settings, state);
  if (next === null) return state;
  return { ...state, pausedUntil: next + 1 };
}
