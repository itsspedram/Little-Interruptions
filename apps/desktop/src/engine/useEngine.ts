import { useSyncExternalStore } from "react";
import { engine } from "./engine.ts";
import type { Snapshot } from "./engine.ts";

export function useEngine(): Snapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot);
}
