import { mergePack, parsePack } from "@little-interruptions/core";
import type { MessagePack } from "@little-interruptions/core";

/** A pack together with the file name it has in /packs (also its name on GitHub). */
export interface PackEntry {
  file: string;
  pack: MessagePack;
}

// Every JSON file in /packs ships inside the app, so a brand-new pack added to
// the repository is picked up by simply rebuilding.
const bundled = import.meta.glob<unknown>("../../../../packs/*.json", {
  eager: true,
  import: "default",
});

/**
 * Bundled packs, merged with whatever newer copy was downloaded earlier.
 * Anything invalid is skipped with a console error instead of crashing the app.
 */
export function loadPacks(readCached: (collection: string) => unknown): PackEntry[] {
  const entries: PackEntry[] = [];
  const paths = Object.keys(bundled).sort();

  for (const path of paths) {
    const file = path.slice(path.lastIndexOf("/") + 1);
    const parsed = parsePack(bundled[path]);
    if (parsed.pack === null) {
      console.error(`Skipping bundled pack ${file}:`, parsed.problems);
      continue;
    }

    const cached = parsePack(readCached(parsed.pack.collection)).pack;
    // Merging the bundled pack into the cached one keeps downloaded messages
    // and also picks up messages that arrived with an app update.
    const merged = mergePack(cached, parsed.pack);
    entries.push({ file, pack: merged.ok ? merged.pack : parsed.pack });
  }
  return entries;
}
