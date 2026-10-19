import { nextFireTime } from "./schedule.ts";
import type { Settings, State } from "./types.ts";

const MS_PER_MINUTE = 60_000;

/** What the menu bar and the quick panel show. */
export type Status =
  /** The user is away, so no session is running. */
  | { kind: "waiting" }
  /** Counting down to the next bell. `busy` appears only when smart pause sees the user occupied. */
  | { kind: "running"; nextAt: number; remainingMs: number; progress: number; busy?: true }
  /** The user asked for quiet until `until`. */
  | { kind: "quiet"; until: number; nextAt: number | null }
  /** A bell is due but waiting for the user to finish what they are doing. */
  | { kind: "held" };

export function getStatus(now: number, settings: Settings, state: State, busy: boolean): Status {
  const quiet = state.pausedUntil !== null && now < state.pausedUntil;
  const nextAt = nextFireTime(now, settings, state);

  if (quiet && state.pausedUntil !== null) return { kind: "quiet", until: state.pausedUntil, nextAt };
  if (nextAt === null) return { kind: "waiting" };
  if (state.deferredRing) return { kind: "held" };

  const interval = settings.intervalMinutes * MS_PER_MINUTE;
  const progress = Math.min(1, Math.max(0, (now - (nextAt - interval)) / interval));
  const status: Status = { kind: "running", nextAt, remainingMs: nextAt - now, progress };
  return settings.smartPause && busy ? { ...status, busy: true } : status;
}

/** "42m", "1h 2m", "2h" or "<1m". Minutes round up, so the label never reads 0 before the bell. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "<1m";
  const total = Math.ceil(ms / MS_PER_MINUTE);
  if (total < 1) return "<1m";
  if (ms < MS_PER_MINUTE) return "<1m";
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** The short text next to the menu bar icon. Empty means icon only. */
export function trayTitle(status: Status, settings: Settings): string {
  if (!settings.showCountdown) return "";
  switch (status.kind) {
    case "running":
      return formatRemaining(status.remainingMs);
    case "quiet":
      return "Quiet";
    case "held":
      return "Later";
    case "waiting":
      return "";
  }
}
