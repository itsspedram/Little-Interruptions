import type { Message, MessagePack, Settings, State } from "./types.ts";

/**
 * Flatten the enabled packs into one list. Pack order is kept, and when two
 * packs reuse a message id the first one wins.
 */
export function collectMessages(packs: MessagePack[], settings: Settings): Message[] {
  const enabled = new Set(settings.enabledPacks);
  const seen = new Set<string>();
  const collected: Message[] = [];
  for (const pack of packs) {
    if (!enabled.has(pack.collection)) continue;
    for (const message of pack.messages) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      collected.push(message);
    }
  }
  return collected;
}

/** Fisher-Yates on a copy; `random` returns a number in [0, 1). */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a === undefined || b === undefined) continue;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/**
 * Pick the next message from a shuffle bag: nothing repeats until every
 * message has been shown once. Ids in the bag that no longer exist are
 * dropped; messages added since the round began join the next round.
 */
export function pickMessage(
  messages: Message[],
  state: State,
  random: () => number,
): { message: Message | null; state: State } {
  if (messages.length === 0) return { message: null, state };

  const byId = new Map<string, Message>();
  for (const message of messages) {
    if (!byId.has(message.id)) byId.set(message.id, message);
  }

  let bag = state.bag.filter((id) => byId.has(id));
  if (bag.length === 0) bag = shuffle([...byId.keys()], random);

  const nextId = bag[0];
  const message = nextId === undefined ? undefined : byId.get(nextId);
  if (message === undefined) return { message: null, state };

  return { message, state: { ...state, bag: bag.slice(1) } };
}
