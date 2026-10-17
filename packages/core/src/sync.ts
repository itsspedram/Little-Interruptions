import { MAX_PACK_SIZE, parsePack } from "./validate.ts";
import type { Message, MessagePack, Settings, State } from "./types.ts";

/** How long to wait between automatic update checks. */
export const PACK_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type MergeResult =
  | { ok: true; pack: MessagePack; added: string[]; updated: string[] }
  | { ok: false; problems: string[] };

/** True when the daily update check is due and the user has not turned it off. */
export function shouldCheckForUpdates(now: number, settings: Settings, state: State): boolean {
  if (!settings.autoUpdatePacks) return false;
  const last = state.lastPackCheckAt;
  if (last === null) return true;
  // A clock that moved backwards must not postpone checks until that time catches up.
  if (now < last) return true;
  return now - last >= PACK_CHECK_INTERVAL_MS;
}

/** Remember that a check just succeeded. */
export function recordPackCheck(state: State, now: number): State {
  return { ...state, lastPackCheckAt: now };
}

/**
 * Fold a downloaded pack into the local copy. The download is untrusted: it is
 * fully validated first, and if anything is wrong nothing changes.
 *
 * New ids are appended, changed text/category replaces the old one, and local
 * messages the remote no longer lists are kept (a partial download can never
 * delete anything).
 */
export function mergePack(local: MessagePack | null, remote: unknown): MergeResult {
  const parsed = parsePack(remote);
  if (parsed.pack === null) return { ok: false, problems: parsed.problems };
  const incoming = parsed.pack;

  if (local === null) {
    return { ok: true, pack: incoming, added: incoming.messages.map((m) => m.id), updated: [] };
  }
  if (local.collection !== incoming.collection) {
    return {
      ok: false,
      problems: [`collection mismatch: expected "${local.collection}", got "${incoming.collection}"`],
    };
  }

  const merged: Message[] = local.messages.map((m) => ({ ...m }));
  const positions = new Map<string, number>(merged.map((m, i) => [m.id, i]));
  const added: string[] = [];
  const updated: string[] = [];

  for (const message of incoming.messages) {
    const position = positions.get(message.id);
    if (position === undefined) {
      positions.set(message.id, merged.length);
      merged.push({ ...message });
      added.push(message.id);
      continue;
    }
    const current = merged[position];
    if (current !== undefined && (current.text !== message.text || current.category !== message.category)) {
      merged[position] = { ...message };
      updated.push(message.id);
    }
  }

  if (merged.length > MAX_PACK_SIZE) {
    return { ok: false, problems: [`merged pack would exceed ${MAX_PACK_SIZE} messages`] };
  }

  return {
    ok: true,
    pack: {
      collection: local.collection,
      version: incoming.version,
      locale: incoming.locale,
      status: incoming.status,
      messages: merged,
    },
    added,
    updated,
  };
}
