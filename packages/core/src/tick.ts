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
  /** The user is occupied: in a call, watching video, presenting. Only used when smart pause is on. */
  busy?: boolean;
}

/**
 * One heartbeat from the shell. Decides, in order:
 * 1. a running session ends if the computer slept or the user went idle;
 * 2. a session starts if there is none and the user is clearly at the computer;
 * 3. a bell falls due if a slot passed between the previous tick and now;
 * 4. a due bell is held while the user is busy (smart pause) and rings, once,
 *    at the first tick when they are not. A held bell is dropped if the session
 *    ends or the user asks for quiet.
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
  const slotPassed = due !== null && due <= now;

  const quiet = next.pausedUntil !== null && now < next.pausedUntil;
  const held = next.sessionStartedAt !== null && !quiet && next.deferredRing;
  const wanted = slotPassed || held;

  const hold = wanted && settings.smartPause && input.busy === true;
  const ring = wanted && !hold;

  if (next.deferredRing !== hold) next = { ...next, deferredRing: hold };
  return { state: next, ring };
}
