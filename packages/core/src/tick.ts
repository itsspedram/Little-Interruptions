import { endSession, isSessionExpired, nextFireTime, startSession } from "./schedule.ts";
import type { Settings, State } from "./types.ts";

/** The user counts as "at the computer" when their last input was this recent. */
export const ACTIVE_WITHIN_SECONDS = 15;

/** A gap between two ticks at least this long means the computer slept. */
export const SLEEP_GAP_MS = 60_000;

export interface TickInput {
  /** Current time, epoch milliseconds. */
  now: number;
  /** Seconds since the user last touched keyboard or mouse. */
  idleSeconds: number;
  /** Milliseconds since the previous tick; 0 for the very first tick. */
  gapMs: number;
}

/**
 * One heartbeat from the shell. Decides, in order:
 * 1. a running session ends if the computer slept or the user went idle;
 * 2. a session starts if there is none and the user is clearly at the computer;
 * 3. a bell rings if a slot fell between the previous tick and now.
 *
 * Because a restarted session has its first slot a full interval away, nothing
 * missed during sleep or idle is ever replayed.
 */
export function onTick(input: TickInput, settings: Settings, state: State): { state: State; ring: boolean } {
  const { now, idleSeconds, gapMs } = input;
  let next = state;

  const lastActivityAt = now - idleSeconds * 1000;
  if (next.sessionStartedAt !== null && (gapMs >= SLEEP_GAP_MS || isSessionExpired(now, lastActivityAt, settings))) {
    next = endSession(next);
  }

  if (next.sessionStartedAt === null && idleSeconds < ACTIVE_WITHIN_SECONDS) {
    next = startSession(next, now);
  }

  const previousTick = now - Math.max(0, gapMs);
  const due = nextFireTime(previousTick, settings, next);
  return { state: next, ring: due !== null && due <= now };
}
