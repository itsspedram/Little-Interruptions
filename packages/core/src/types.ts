/** Categories a message may belong to. Contributors extend this list in a PR. */
export const CATEGORIES = ["gentle_caring", "playful_weird", "tiny_mindfulness"] as const;
export type Category = (typeof CATEGORIES)[number];

/** The interval choices the UI offers; any positive whole number of minutes is also valid. */
export const INTERVAL_PRESETS = [60, 90, 120] as const;

/** Longest message text a pack may contain, in characters. */
export const MAX_MESSAGE_LENGTH = 100;

/** All times are epoch milliseconds, so state round-trips through JSON unchanged. */
export interface Settings {
  version: 1;
  /** Minutes between bells while a session is active. Whole number, at least 1. */
  intervalMinutes: number;
  /** Minutes without activity after which a session counts as over. */
  idleMinutes: number;
  /** `collection` names of the message packs that are switched on. */
  enabledPacks: string[];
  /** Whether the app may fetch new messages from the project's GitHub once a day. */
  autoUpdatePacks: boolean;
  /** Whether the bell sound plays together with the message. */
  soundEnabled: boolean;
}

export interface State {
  version: 1;
  /** When the current session began, or null when the user is not at the computer. */
  sessionStartedAt: number | null;
  /** No bell rings before this moment. Null when not paused. */
  pausedUntil: number | null;
  /** Message ids still to be shown in the current shuffle round. */
  bag: string[];
  /** When the last successful message update check happened, or null if never. */
  lastPackCheckAt: number | null;
}

export interface Message {
  id: string;
  category: string;
  text: string;
}

export interface MessagePack {
  collection: string;
  version: string;
  locale: string;
  status: string;
  messages: Message[];
}
