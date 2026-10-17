import { describe, expect, it } from "vitest";
import { createDefaultSettings, createInitialState } from "./defaults.ts";
import { mergePack, PACK_CHECK_INTERVAL_MS, recordPackCheck, shouldCheckForUpdates } from "./sync.ts";
import type { MessagePack, Settings, State } from "./types.ts";

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0);
const HOUR = 60 * 60 * 1000;

const settings = (change: Partial<Settings> = {}): Settings => ({ ...createDefaultSettings(), ...change });
const stateChecked = (at: number | null): State => ({ ...createInitialState(), lastPackCheckAt: at });

function localPack(): MessagePack {
  return {
    collection: "Little Interruptions",
    version: "0.1.0",
    locale: "en",
    status: "draft",
    messages: [
      { id: "li-001", category: "gentle_caring", text: "Hey. You don't have to figure everything out right now." },
      { id: "li-002", category: "playful_weird", text: "Quick question. Have you blinked recently?" },
    ],
  };
}

function remotePack(change: Record<string, unknown> = {}) {
  return { ...localPack(), version: "0.2.0", ...change };
}

describe("shouldCheckForUpdates", () => {
  it("checks when it has never checked before", () => {
    expect(shouldCheckForUpdates(T0, settings(), stateChecked(null))).toBe(true);
  });

  it("waits until a full day has passed", () => {
    expect(shouldCheckForUpdates(T0 + PACK_CHECK_INTERVAL_MS - 1, settings(), stateChecked(T0))).toBe(false);
  });

  it("checks again exactly one day later", () => {
    expect(shouldCheckForUpdates(T0 + PACK_CHECK_INTERVAL_MS, settings(), stateChecked(T0))).toBe(true);
  });

  it("never checks when automatic updates are off", () => {
    expect(shouldCheckForUpdates(T0 + 100 * HOUR, settings({ autoUpdatePacks: false }), stateChecked(null))).toBe(
      false,
    );
  });

  it("checks again if the clock moved backwards, so it cannot get stuck", () => {
    expect(shouldCheckForUpdates(T0 - 10 * HOUR, settings(), stateChecked(T0))).toBe(true);
  });
});

describe("recordPackCheck", () => {
  it("stores the time of the check without touching anything else", () => {
    const before: State = { ...createInitialState(), bag: ["li-001"] };
    const after = recordPackCheck(before, T0);
    expect(after.lastPackCheckAt).toBe(T0);
    expect(after.bag).toEqual(["li-001"]);
    expect(before.lastPackCheckAt).toBeNull();
  });
});

describe("mergePack", () => {
  it("adds messages that are new in the remote pack and reports them", () => {
    const remote = remotePack({
      messages: [
        ...localPack().messages,
        { id: "li-100", category: "tiny_mindfulness", text: "Notice your feet." },
      ],
    });
    const result = mergePack(localPack(), remote);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.added).toEqual(["li-100"]);
    expect(result.updated).toEqual([]);
    expect(result.pack.messages.map((m) => m.id)).toEqual(["li-001", "li-002", "li-100"]);
  });

  it("reports nothing when the remote pack matches the local one", () => {
    const result = mergePack(localPack(), remotePack());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.added).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.pack.messages).toEqual(localPack().messages);
  });

  it("updates the text of a message that changed upstream and reports it", () => {
    const remote = remotePack({
      messages: [
        localPack().messages[0],
        { id: "li-002", category: "playful_weird", text: "Quick question. Blinked lately?" },
      ],
    });
    const result = mergePack(localPack(), remote);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.updated).toEqual(["li-002"]);
    expect(result.pack.messages[1]?.text).toBe("Quick question. Blinked lately?");
  });

  it("keeps local messages that the remote pack no longer lists", () => {
    const remote = remotePack({ messages: [localPack().messages[0]] });
    const result = mergePack(localPack(), remote);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.messages.map((m) => m.id)).toEqual(["li-001", "li-002"]);
  });

  it("takes the pack metadata from the remote pack", () => {
    const result = mergePack(localPack(), remotePack({ version: "0.3.0", status: "stable" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.version).toBe("0.3.0");
    expect(result.pack.status).toBe("stable");
  });

  it("accepts a valid remote pack when there is no local copy yet", () => {
    const result = mergePack(null, remotePack());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.added).toEqual(["li-001", "li-002"]);
  });

  it("rejects an invalid remote pack and explains why", () => {
    const result = mergePack(localPack(), { collection: "Little Interruptions", messages: "oops" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it("rejects a remote message that is too long, so one bad line cannot be installed", () => {
    const remote = remotePack({
      messages: [...localPack().messages, { id: "li-101", category: "gentle_caring", text: "x".repeat(101) }],
    });
    const result = mergePack(localPack(), remote);
    expect(result.ok).toBe(false);
  });

  it("rejects a remote pack for a different collection", () => {
    const result = mergePack(localPack(), remotePack({ collection: "Somebody Else" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join("\n")).toContain("collection");
  });

  it("does not change the local pack object it is given", () => {
    const local = localPack();
    const remote = remotePack({
      messages: [...local.messages, { id: "li-100", category: "tiny_mindfulness", text: "Notice your feet." }],
    });
    mergePack(local, remote);
    expect(local.messages).toHaveLength(2);
  });
});
