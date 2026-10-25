import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import {
  collectMessages,
  collectWelcomeMessages,
  endSession,
  getStatus,
  mergePack,
  onTick,
  pauseUntil,
  pickMessage,
  pickWelcome,
  recordPackCheck,
  resume,
  skipNext,
  shouldCheckForUpdates,
  trayTitle,
  validateSettings,
} from "@little-interruptions/core";
import type { DisplayStyle, Message, Settings, State, Status } from "@little-interruptions/core";
import { PACK_BASE_URL, isUpdateSourceConfigured } from "../config.ts";
import { loadPacks } from "./packs.ts";
import type { PackEntry } from "./packs.ts";
import { storage } from "./storage.ts";
import { describeStatus } from "../ui/describe.ts";
import { PANEL_STATUS_EVENT } from "../ui/panelTypes.ts";
import type { PanelPayload } from "../ui/panelTypes.ts";

const HOUR_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_DOWNLOAD_CHARS = 512 * 1024;
const BROWSER_TICK_MS = 5000;

interface TickPayload {
  now: number;
  idleSeconds: number;
  gapMs: number;
  busy: boolean;
}

export type SyncStatus =
  | { kind: "idle"; message: string | null }
  | { kind: "checking" }
  | { kind: "error"; message: string }
  | { kind: "unconfigured" };

export interface PackSummary {
  collection: string;
  locale: string;
  count: number;
}

/** An immutable picture of the engine, in the shape React's useSyncExternalStore wants. */
export interface Snapshot {
  settings: Settings;
  state: State;
  packs: PackSummary[];
  messageCount: number;
  status: Status;
  now: number;
  sync: SyncStatus;
  isNative: boolean;
}

function isNative(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_DOWNLOAD_CHARS) throw new Error("download is too large");
    return JSON.parse(text) as unknown;
  } finally {
    window.clearTimeout(timer);
  }
}

async function showBell(message: Message, sound: boolean, style: DisplayStyle): Promise<void> {
  if (!isNative()) {
    console.info("[bell]", message.text);
    return;
  }
  await invoke("show_popup", { id: message.id, category: message.category, text: message.text, sound, style });
}

/**
 * Glue between the pure core and the desktop shell. It owns the current
 * settings, state and packs, reacts to the heartbeat the shell sends, and
 * saves what changes. All decisions are made by functions in the core.
 */
class Engine {
  private settings: Settings = storage.loadSettings();
  // A launch never resumes an old session; the first heartbeat decides.
  private state: State = endSession(storage.loadState());
  private packs: PackEntry[] = loadPacks(storage.readPack);
  private listeners = new Set<() => void>();
  private syncStatus: SyncStatus = { kind: "idle", message: null };
  private syncing = false;
  private retryAt = 0;
  private started = false;
  private busy = false;
  private lastTrayKey = "";
  private snapshot: Snapshot;

  constructor() {
    this.snapshot = this.buildSnapshot(Date.now());
  }

  // Arrow properties keep `this` bound when handed to useSyncExternalStore.
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): Snapshot => this.snapshot;

  start(): void {
    if (this.started) return;
    this.started = true;

    if (isNative()) {
      if (!this.settings.onboarded) void invoke("open_settings");
      void listen<TickPayload>("tick", (event) => this.handleTick(event.payload));
      void listen<string>("menu", (event) => this.handleMenu(event.payload));
      return;
    }

    // Plain browser (developing the UI without Tauri): pretend the user is always active.
    let last = Date.now();
    window.setInterval(() => {
      const now = Date.now();
      this.handleTick({ now, idleSeconds: 0, gapMs: now - last, busy: false });
      last = now;
    }, BROWSER_TICK_MS);
  }

  /** Change settings. Returns a list of problems; empty means it was applied. */
  updateSettings(patch: Partial<Settings>): string[] {
    const candidate: Settings = { ...this.settings, ...patch };
    const problems = validateSettings(candidate);
    if (problems.length > 0) return problems;
    this.settings = candidate;
    storage.saveSettings(this.settings);
    this.commit();
    return [];
  }

  /** Switch a kind of message on or off. At least one kind must stay on. */
  setCategoryEnabled(category: string, enabled: boolean): boolean {
    const others = this.settings.enabledCategories.filter((name) => name !== category);
    const next = enabled ? [...others, category] : others;
    if (next.length === 0) return false;
    return this.updateSettings({ enabledCategories: next }).length === 0;
  }

  /** Switch a pack on or off. At least one pack must stay on. */
  setPackEnabled(collection: string, enabled: boolean): boolean {
    const others = this.settings.enabledPacks.filter((name) => name !== collection);
    const next = enabled ? [...others, collection] : others;
    if (next.length === 0) return false;
    return this.updateSettings({ enabledPacks: next }).length === 0;
  }

  pauseFor(minutes: number): void {
    this.state = pauseUntil(this.state, Date.now() + minutes * 60_000);
    storage.saveState(this.state);
    this.commit();
  }

  /** Skip only the next bell. */
  skipNextBell(): void {
    this.state = skipNext(Date.now(), this.settings, this.state);
    storage.saveState(this.state);
    this.commit();
  }

  resumeNow(): void {
    this.state = resume(this.state);
    storage.saveState(this.state);
    this.commit();
  }

  /** Show a message right now (the "Ring now" button and menu item). */
  async ring(): Promise<void> {
    const messages = collectMessages(
      this.packs.map((entry) => entry.pack),
      this.settings,
    );
    const picked = pickMessage(messages, this.state, Math.random);
    if (picked.message === null) return;
    this.state = picked.state;
    storage.saveState(this.state);
    this.commit();
    await showBell(picked.message, this.settings.soundEnabled, this.settings.displayStyle);
  }

  /** Greet the user after a long absence: a welcome message if the packs have one, a plain greeting if not. */
  private async welcome(): Promise<void> {
    const pool = collectWelcomeMessages(
      this.packs.map((entry) => entry.pack),
      this.settings,
    );
    const message = pickWelcome(pool, Math.random) ?? {
      id: "welcome-plain",
      category: "welcome_back",
      text: "Welcome back.",
    };
    await showBell(message, false, this.settings.displayStyle);
  }

  /** Download new messages now, whether or not a daily check is due. */
  async checkForUpdates(): Promise<void> {
    if (this.syncing) return;
    if (!isUpdateSourceConfigured()) {
      this.syncStatus = { kind: "unconfigured" };
      this.commit();
      return;
    }

    this.syncing = true;
    this.syncStatus = { kind: "checking" };
    this.commit();

    let networkFailed = false;
    let added = 0;
    let updated = 0;
    const rejected: string[] = [];
    const nextPacks: PackEntry[] = [];

    for (const entry of this.packs) {
      try {
        const remote = await fetchJson(PACK_BASE_URL + entry.file);
        const merged = mergePack(entry.pack, remote);
        if (merged.ok) {
          added += merged.added.length;
          updated += merged.updated.length;
          storage.savePack(merged.pack);
          nextPacks.push({ file: entry.file, pack: merged.pack });
        } else {
          rejected.push(`${entry.file}: ${merged.problems[0] ?? "invalid"}`);
          nextPacks.push(entry);
        }
      } catch {
        networkFailed = true;
        nextPacks.push(entry);
      }
    }

    this.packs = nextPacks;
    this.syncing = false;
    const now = Date.now();

    if (networkFailed) {
      this.retryAt = now + HOUR_MS;
      this.syncStatus = { kind: "error", message: "Couldn't reach GitHub. Will try again within the hour." };
    } else {
      this.state = recordPackCheck(this.state, now);
      storage.saveState(this.state);
      const summary =
        rejected.length > 0
          ? `Skipped a download that didn't look right (${rejected[0]}).`
          : added + updated === 0
            ? "You're up to date."
            : `Got ${added} new and ${updated} changed messages.`;
      this.syncStatus = { kind: "idle", message: summary };
    }
    this.commit(now);
  }

  private handleTick(payload: TickPayload): void {
    this.busy = payload.busy;
    const result = onTick(payload, this.settings, this.state);
    if (result.state !== this.state) {
      this.state = result.state;
      storage.saveState(this.state);
    }
    // Until the first-run setup is finished nothing rings; the user hasn't chosen how yet.
    if (this.settings.onboarded) {
      if (result.welcome) void this.welcome();
      else if (result.ring) void this.ring();
    }
    this.maybeCheckForUpdates(payload.now);
    this.commit(payload.now);
  }

  private handleMenu(id: string): void {
    switch (id) {
      case "ring_now":
        void this.ring();
        break;
      case "pause_1h":
        this.pauseFor(60);
        break;
      case "pause_3h":
        this.pauseFor(180);
        break;
      case "resume":
        this.resumeNow();
        break;
      case "panel_opened":
        // The quick panel just opened; send it fresh numbers.
        this.commit();
        break;
      default:
        if (id.startsWith("interval:")) this.updateSettings({ intervalMinutes: Number(id.slice("interval:".length)) });
        break;
    }
  }

  private maybeCheckForUpdates(now: number): void {
    if (this.syncing || now < this.retryAt) return;
    if (!isUpdateSourceConfigured()) return;
    if (!shouldCheckForUpdates(now, this.settings, this.state)) return;
    void this.checkForUpdates();
  }

  private buildSnapshot(now: number): Snapshot {
    const messages = collectMessages(
      this.packs.map((entry) => entry.pack),
      this.settings,
    );
    return {
      settings: this.settings,
      state: this.state,
      packs: this.packs.map(({ pack }) => ({
        collection: pack.collection,
        locale: pack.locale,
        count: pack.messages.length,
      })),
      messageCount: messages.length,
      status: getStatus(now, this.settings, this.state, this.busy),
      now,
      sync: this.syncStatus,
      isNative: isNative(),
    };
  }

  private commit(now: number = Date.now()): void {
    this.snapshot = this.buildSnapshot(now);
    for (const listener of this.listeners) listener();
    this.publish();
  }

  /** Push the live status to the menu bar and to the quick panel. */
  private publish(): void {
    if (!isNative()) return;
    const { status, settings, now } = this.snapshot;

    const title = trayTitle(status, settings);
    const tooltip = `Little Interruptions · ${describeStatus(status).title}`;
    const key = `${title}\u0000${tooltip}`;
    if (key !== this.lastTrayKey) {
      this.lastTrayKey = key;
      void invoke("set_tray_status", { title, tooltip });
    }

    const payload: PanelPayload = { status, intervalMinutes: settings.intervalMinutes, now };
    void emit(PANEL_STATUS_EVENT, payload);
  }
}

export const engine = new Engine();
