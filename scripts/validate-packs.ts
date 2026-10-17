// Validates every message pack in /packs. Run with: pnpm validate:packs
// Used by CI and by contributors before opening a pull request.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePack } from "../packages/core/src/index.ts";

const packsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "packs");
const files = readdirSync(packsDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

if (files.length === 0) {
  console.error("No packs found in /packs");
  process.exit(1);
}

let failed = false;
for (const file of files) {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(join(packsDir, file), "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`✖ ${file}: not valid JSON (${reason})`);
    failed = true;
    continue;
  }

  const problems = validatePack(data);
  if (problems.length === 0) {
    const count = Array.isArray((data as { messages?: unknown }).messages)
      ? (data as { messages: unknown[] }).messages.length
      : 0;
    console.log(`✔ ${file} (${count} messages)`);
  } else {
    failed = true;
    console.error(`✖ ${file}`);
    for (const problem of problems) console.error(`    - ${problem}`);
  }
}

process.exit(failed ? 1 : 0);
