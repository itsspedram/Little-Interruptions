import { describe, expect, it } from "vitest";
import { createDefaultSettings, createInitialState } from "./defaults.ts";
import { collectMessages, collectWelcomeMessages, pickMessage, pickSound, pickWelcome } from "./messages.ts";
import { makeRandom } from "./test-utils.ts";
import type { Message, MessagePack, State } from "./types.ts";

const msg = (id: string): Message => ({ id, category: "gentle_caring", text: `Text ${id}` });

const pack = (collection: string, ids: string[]): MessagePack => ({
  collection,
  version: "0.1.0",
  locale: "en",
  status: "draft",
  messages: ids.map(msg),
});

function drawAll(messages: Message[], count: number, seed: number, start: State = createInitialState()) {
  const random = makeRandom(seed);
  let state = start;
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const result = pickMessage(messages, state, random);
    state = result.state;
    ids.push(result.message?.id ?? "NONE");
  }
  return { ids, state };
}

describe("collectMessages", () => {
  const settingsFor = (...enabledPacks: string[]) => ({ ...createDefaultSettings(), enabledPacks });

  it("returns only messages from enabled packs", () => {
    const packs = [pack("A", ["a1", "a2"]), pack("B", ["b1"])];
    expect(collectMessages(packs, settingsFor("B")).map((m) => m.id)).toEqual(["b1"]);
  });

  it("keeps pack order, then message order", () => {
    const packs = [pack("A", ["a1", "a2"]), pack("B", ["b1"])];
    expect(collectMessages(packs, settingsFor("A", "B")).map((m) => m.id)).toEqual(["a1", "a2", "b1"]);
  });

  it("lets the first pack win when two packs share a message id", () => {
    const first = pack("A", ["same"]);
    const second = { ...pack("B", ["same"]), messages: [{ id: "same", category: "gentle_caring", text: "Other" }] };
    const result = collectMessages([first, second], settingsFor("A", "B"));
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe("Text same");
  });

  it("returns nothing when no pack is enabled", () => {
    expect(collectMessages([pack("A", ["a1"])], settingsFor())).toEqual([]);
  });
});

describe("pickMessage", () => {
  const five = ["a", "b", "c", "d", "e"].map(msg);

  it("returns no message and leaves state alone for an empty list", () => {
    const state = createInitialState();
    const result = pickMessage([], state, makeRandom(1));
    expect(result.message).toBeNull();
    expect(result.state).toEqual(state);
  });

  it("shows every message exactly once per round", () => {
    const { ids } = drawAll(five, 5, 42);
    expect(new Set(ids).size).toBe(5);
  });

  it("holds the rest of the round in the bag", () => {
    const { state } = drawAll(five, 1, 42);
    expect(state.bag).toHaveLength(4);
  });

  it("starts a new round after the bag is empty", () => {
    const { ids, state } = drawAll(five, 6, 42);
    expect(ids[5]).not.toBe("NONE");
    expect(state.bag).toHaveLength(4);
  });

  it("covers every message again in the second round", () => {
    const { ids } = drawAll(five, 10, 42);
    expect(new Set(ids.slice(5)).size).toBe(5);
  });

  it("is repeatable with the same random source", () => {
    expect(drawAll(five, 8, 5).ids).toEqual(drawAll(five, 8, 5).ids);
  });

  it("changes the order with a different random source", () => {
    expect(drawAll(five, 5, 5).ids).not.toEqual(drawAll(five, 5, 6).ids);
  });

  it("always returns the only message when there is one", () => {
    const { ids } = drawAll([msg("solo")], 4, 3);
    expect(ids).toEqual(["solo", "solo", "solo", "solo"]);
  });

  it("drops bag entries whose message no longer exists", () => {
    const state: State = { ...createInitialState(), bag: ["gone", "b"] };
    const result = pickMessage([msg("a"), msg("b")], state, makeRandom(1));
    expect(result.message?.id).toBe("b");
    expect(result.state.bag).toEqual([]);
  });

  it("does not change the state it is given", () => {
    const state: State = { ...createInitialState(), bag: ["a", "b"] };
    pickMessage(five, state, makeRandom(1));
    expect(state.bag).toEqual(["a", "b"]);
  });

  it("brings a message added mid-round into the next round", () => {
    const three = ["a", "b", "c"].map(msg);
    const four = ["a", "b", "c", "d"].map(msg);
    const random = makeRandom(7);

    let state = createInitialState();
    const firstRound: string[] = [];
    let result = pickMessage(three, state, random);
    state = result.state;
    firstRound.push(result.message?.id ?? "NONE");

    for (let i = 0; i < 2; i++) {
      result = pickMessage(four, state, random);
      state = result.state;
      firstRound.push(result.message?.id ?? "NONE");
    }
    expect(firstRound).not.toContain("d");

    const secondRound: string[] = [];
    for (let i = 0; i < 4; i++) {
      result = pickMessage(four, state, random);
      state = result.state;
      secondRound.push(result.message?.id ?? "NONE");
    }
    expect(new Set(secondRound).size).toBe(4);
    expect(secondRound).toContain("d");
  });
});

describe("message kinds", () => {
  const mixed: MessagePack = {
    collection: "Mixed",
    version: "0.1.0",
    locale: "en",
    status: "draft",
    messages: [
      { id: "g1", category: "gentle_caring", text: "g" },
      { id: "p1", category: "playful_weird", text: "p" },
      { id: "t1", category: "tiny_mindfulness", text: "t" },
      { id: "w1", category: "welcome_back", text: "w" },
    ],
  };
  const only = (enabledCategories: string[]) => ({
    ...createDefaultSettings(),
    enabledPacks: ["Mixed"],
    enabledCategories,
  });

  it("keeps only the kinds the user picked", () => {
    expect(collectMessages([mixed], only(["playful_weird"])).map((m) => m.id)).toEqual(["p1"]);
    expect(collectMessages([mixed], only(["gentle_caring", "tiny_mindfulness"])).map((m) => m.id)).toEqual(["g1", "t1"]);
  });

  it("never puts welcome messages in the regular rotation", () => {
    const ids = collectMessages([mixed], only(["gentle_caring", "playful_weird", "tiny_mindfulness"])).map((m) => m.id);
    expect(ids).not.toContain("w1");
    expect(collectMessages([mixed], only(["welcome_back"]))).toEqual([]);
  });

  it("collects welcome messages only from enabled packs", () => {
    expect(collectWelcomeMessages([mixed], only(["gentle_caring"])).map((m) => m.id)).toEqual(["w1"]);
    expect(collectWelcomeMessages([mixed], { ...only([]), enabledPacks: ["Other"] })).toEqual([]);
  });

  it("picks a welcome message at random, or none when there are none", () => {
    const list: Message[] = [msg("a"), msg("b"), msg("c")];
    expect(pickWelcome(list, () => 0)?.id).toBe("a");
    expect(pickWelcome(list, () => 0.99)?.id).toBe("c");
    expect(pickWelcome([], () => 0.5)).toBeNull();
  });
});

describe("pickSound", () => {
  it("returns the chosen sound whatever the random source says", () => {
    const settings = { ...createDefaultSettings(), soundChoice: "pond" as const };
    expect(pickSound(settings, () => 0)).toBe("pond");
    expect(pickSound(settings, () => 0.99)).toBe("pond");
  });

  it("draws from every sound when the choice is random", () => {
    const settings = { ...createDefaultSettings(), soundChoice: "random" as const };
    expect(pickSound(settings, () => 0)).toBe("drip");
    expect(pickSound(settings, () => 0.9999)).toBe("bubble");
    const seen = new Set<string>();
    const random = makeRandom(5);
    for (let i = 0; i < 200; i++) seen.add(pickSound(settings, random));
    expect(seen.size).toBe(10);
  });
});
