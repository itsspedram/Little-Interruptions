/** Categories a message may belong to. Contributors extend this list in a PR. */
export const REGULAR_CATEGORIES = ["gentle_caring", "playful_weird", "tiny_mindfulness"] as const;
export type RegularCategory = (typeof REGULAR_CATEGORIES)[number];

/** Shown once when the user comes back after a long absence; never part of the regular rotation. */
export const WELCOME_CATEGORY = "welcome_back";

export const CATEGORIES = [...REGULAR_CATEGORIES, WELCOME_CATEGORY] as const;
export type Category = (typeof CATEGORIES)[number];

/** The water-drop sounds that ship with the app (files in src-tauri/assets/drops). */
export const SOUND_IDS = ["drip", "bloop", "plink", "pond", "twin", "glass", "cave", "tiny", "leaf", "bubble"] as const;
export type SoundId = (typeof SOUND_IDS)[number];

/** One fixed sound, or "random" to draw a different one each time. */
export const SOUND_CHOICES = ["random", ...SOUND_IDS] as const;
export type SoundChoice = (typeof SOUND_CHOICES)[number];

/** How a bell is shown: a small card, a translucent full-screen overlay, or a system notification. */
export const DISPLAY_STYLES = ["card", "overlay", "notification"] as const;
export type DisplayStyle = (typeof DISPLAY_STYLES)[number];

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
  /** Which drop sound plays, or "random". Only used while soundEnabled is on. */
  soundChoice: SoundChoice;
  /** Hold a due bell while the user is busy (meeting, video, presentation) and ring when they are done. */
  smartPause: boolean;
  /** Also count a microphone in use (a call, a recording) as busy. Only matters while smartPause is on. */
  smartPauseMic: boolean;
  /** Start the app when the user logs in. */
  launchAtLogin: boolean;
  /** Whether the menu bar shows the time left until the next bell. */
  showCountdown: boolean;
  /** Which kinds of message may be shown. Never empty. */
  enabledCategories: string[];
  /** How a bell is shown. */
  displayStyle: DisplayStyle;
  /** Greet the user with a short message when they return after a long absence. */
  welcomeBack: boolean;
  /** How long an absence, in minutes, counts as "a long time". */
  welcomeAfterMinutes: number;
  /** False until the user has finished the first-run setup. */
  onboarded: boolean;
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
  /** A bell fell due while the user was busy and is waiting for them to finish. */
  deferredRing: boolean;
  /** The last moment the user was seen at the computer (saved at most once a minute), or null if never. */
  lastActiveAt: number | null;
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
