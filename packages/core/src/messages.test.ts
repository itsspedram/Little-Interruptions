import { describe, expect, it } from "vitest";
import { createDefaultSettings, createInitialState } from "./defaults.ts";
import { collectMessages, pickMessage } from "./messages.ts";
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
