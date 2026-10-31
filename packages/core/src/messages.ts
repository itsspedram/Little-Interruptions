import { SOUND_IDS, WELCOME_CATEGORY } from "./types.ts";
import type { Message, MessagePack, Settings, SoundId, State } from "./types.ts";

function collect(packs: MessagePack[], settings: Settings, keep: (message: Message) => boolean): Message[] {
  const enabled = new Set(settings.enabledPacks);
  const seen = new Set<string>();
  const collected: Message[] = [];
  for (const pack of packs) {
    if (!enabled.has(pack.collection)) continue;
    for (const message of pack.messages) {
      if (seen.has(message.id) || !keep(message)) continue;
      seen.add(message.id);
      collected.push(message);
    }
  }
  return collected;
}

/**
 * The regular rotation: messages from the enabled packs, limited to the
 * categories the user picked. Welcome messages never appear here. Pack order is
 * kept, and when two packs reuse a message id the first one wins.
 */
export function collectMessages(packs: MessagePack[], settings: Settings): Message[] {
  const categories = new Set(settings.enabledCategories);
  return collect(packs, settings, (m) => m.category !== WELCOME_CATEGORY && categories.has(m.category));
}

/** Every welcome-back message from the enabled packs. */
export function collectWelcomeMessages(packs: MessagePack[], settings: Settings): Message[] {
  return collect(packs, settings, (m) => m.category === WELCOME_CATEGORY);
}

/** A random welcome message, or null when there is none (the app then uses its own plain greeting). */
export function pickWelcome(messages: Message[], random: () => number): Message | null {
  if (messages.length === 0) return null;
  const index = Math.min(messages.length - 1, Math.floor(random() * messages.length));
  return messages[index] ?? null;
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

/** The sound for one bell: the chosen one, or a random one when the choice is "random". */
export function pickSound(settings: Settings, random: () => number): SoundId {
  if (settings.soundChoice !== "random") return settings.soundChoice;
  const index = Math.min(SOUND_IDS.length - 1, Math.floor(random() * SOUND_IDS.length));
  return SOUND_IDS[index] ?? "drip";
}
