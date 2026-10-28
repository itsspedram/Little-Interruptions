import type { Status } from "@little-interruptions/core";

/** Event the engine emits so the quick panel can show live numbers without running an engine of its own. */
export const PANEL_STATUS_EVENT = "status";

export interface PanelPayload {
  status: Status;
  intervalMinutes: number;
  /** Epoch ms when this was produced. */
  now: number;
}
