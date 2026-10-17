import { parseSettings, parseState } from "@little-interruptions/core";
import type { MessagePack, Settings, State } from "@little-interruptions/core";

const SETTINGS_KEY = "li.settings.v1";
const STATE_KEY = "li.state.v1";
const packKey = (collection: string): string => `li.pack.v1.${collection}`;

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; the app keeps working for this run.
  }
}

/** Everything the app keeps lives in the webview's local storage, on this computer only. */
export const storage = {
  loadSettings: (): Settings => parseSettings(read(SETTINGS_KEY)),
  saveSettings: (settings: Settings): void => write(SETTINGS_KEY, settings),
  loadState: (): State => parseState(read(STATE_KEY)),
  saveState: (state: State): void => write(STATE_KEY, state),
  readPack: (collection: string): unknown => read(packKey(collection)),
  savePack: (pack: MessagePack): void => write(packKey(pack.collection), pack),
};
