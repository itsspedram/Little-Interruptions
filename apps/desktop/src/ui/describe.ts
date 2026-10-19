import { formatRemaining } from "@little-interruptions/core";
import type { Status } from "@little-interruptions/core";

export const formatClock = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Plain-language headline and detail for a status; shared by the settings window, the panel and the tray tooltip. */
export function describeStatus(status: Status): { title: string; detail: string } {
  switch (status.kind) {
    case "running":
      return {
        title: `Next bell in ${formatRemaining(status.remainingMs)}`,
        detail:
          status.busy === true
            ? "Looks like you're busy. If the bell comes due, it will wait for you."
            : `Around ${formatClock(status.nextAt)}.`,
      };
    case "quiet":
      return { title: `Quiet until ${formatClock(status.until)}`, detail: "No bells until then." };
    case "held":
      return { title: "Waiting for you to finish", detail: "A bell is due. It will ring as soon as you're free." };
    case "waiting":
      return { title: "Resting", detail: "The bell starts counting when you're back at the keyboard." };
  }
}
