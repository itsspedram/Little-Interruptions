import { CATEGORIES, DISPLAY_STYLES, MAX_MESSAGE_LENGTH, REGULAR_CATEGORIES } from "./types.ts";
import type { Message, MessagePack } from "./types.ts";

/** Upper bound on messages in one pack; protects against absurd remote data. */
export const MAX_PACK_SIZE = 2000;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const MAX_MINUTES = 1440;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCategory(value: unknown): boolean {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/** Check unknown data (a file, a download) and, if it is sound, return a clean copy. */
function inspectPack(input: unknown): { pack: MessagePack | null; problems: string[] } {
  if (!isRecord(input)) return { pack: null, problems: ["pack must be an object"] };

  const problems: string[] = [];
  const { collection, version, locale, status, messages } = input;

  if (!isNonEmptyString(collection)) problems.push("collection must be a non-empty string");
  if (!isNonEmptyString(version)) problems.push("version must be a non-empty string");
  if (!isNonEmptyString(locale)) problems.push("locale must be a non-empty string");
  if (!isNonEmptyString(status)) problems.push("status must be a non-empty string");

  const clean: Message[] = [];
  if (!Array.isArray(messages) || messages.length === 0) {
    problems.push("messages must be a non-empty list");
  } else if (messages.length > MAX_PACK_SIZE) {
    problems.push(`messages has more than ${MAX_PACK_SIZE} entries`);
  } else {
    const seenIds = new Set<string>();
    messages.forEach((entry: unknown, index) => {
      const label = `messages[${index}]`;
      if (!isRecord(entry)) {
        problems.push(`${label} must be an object`);
        return;
      }
      const { id, category, text } = entry;
      const name = typeof id === "string" ? `${label} (${id})` : label;
      let valid = true;

      if (typeof id !== "string" || !ID_PATTERN.test(id)) {
        problems.push(`${name}: id must be 1-64 characters of letters, digits, "-" or "_"`);
        valid = false;
      } else if (seenIds.has(id)) {
        problems.push(`${name}: duplicate id ${id}`);
        valid = false;
      } else {
        seenIds.add(id);
      }

      if (!isCategory(category)) {
        problems.push(
          `${name}: category "${String(category)}" is not one of ${CATEGORIES.join(", ")}`,
        );
        valid = false;
      }

      if (!isNonEmptyString(text)) {
        problems.push(`${name}: text must not be empty`);
        valid = false;
      } else {
        if (Array.from(text).length > MAX_MESSAGE_LENGTH) {
          problems.push(`${name}: text is longer than ${MAX_MESSAGE_LENGTH} characters`);
          valid = false;
        }
        if (CONTROL_CHARS.test(text)) {
          problems.push(`${name}: text contains control characters`);
          valid = false;
        }
      }

      if (valid && typeof id === "string" && typeof category === "string" && typeof text === "string") {
        clean.push({ id, category, text });
      }
    });
  }

  if (
    problems.length > 0 ||
    typeof collection !== "string" ||
    typeof version !== "string" ||
    typeof locale !== "string" ||
    typeof status !== "string"
  ) {
    return { pack: null, problems };
  }
  return { pack: { collection, version, locale, status, messages: clean }, problems };
}

/** A list of everything wrong with a pack; empty means it is valid. */
export function validatePack(input: unknown): string[] {
  return inspectPack(input).problems;
}

/**
 * Validate and copy a pack. Unknown extra fields are dropped, so remote data
 * can never smuggle anything past the four known pack fields and three message fields.
 */
export function parsePack(input: unknown): { pack: MessagePack | null; problems: string[] } {
  return inspectPack(input);
}

export function isWholeMinutes(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_MINUTES;
}

/** A list of everything wrong with a settings object; empty means it is valid. */
export function validateSettings(input: unknown): string[] {
  if (!isRecord(input)) return ["settings must be an object"];
  const problems: string[] = [];

  if (input.version !== 1) problems.push("version must be 1");
  if (!isWholeMinutes(input.intervalMinutes)) {
    problems.push(`intervalMinutes must be a whole number from 1 to ${MAX_MINUTES}`);
  }
  if (!isWholeMinutes(input.idleMinutes)) {
    problems.push(`idleMinutes must be a whole number from 1 to ${MAX_MINUTES}`);
  }
  if (!Array.isArray(input.enabledPacks) || !input.enabledPacks.every((p) => typeof p === "string")) {
    problems.push("enabledPacks must be a list of pack names");
  }
  if (typeof input.autoUpdatePacks !== "boolean") {
    problems.push("autoUpdatePacks must be true or false");
  }
  if (typeof input.soundEnabled !== "boolean") {
    problems.push("soundEnabled must be true or false");
  }
  if (typeof input.smartPause !== "boolean") {
    problems.push("smartPause must be true or false");
  }
  if (typeof input.showCountdown !== "boolean") {
    problems.push("showCountdown must be true or false");
  }
  if (
    !Array.isArray(input.enabledCategories) ||
    input.enabledCategories.length === 0 ||
    !input.enabledCategories.every((c) => (REGULAR_CATEGORIES as readonly unknown[]).includes(c))
  ) {
    problems.push(`enabledCategories must be a non-empty list of ${REGULAR_CATEGORIES.join(", ")}`);
  }
  if (!(DISPLAY_STYLES as readonly unknown[]).includes(input.displayStyle)) {
    problems.push(`displayStyle must be one of ${DISPLAY_STYLES.join(", ")}`);
  }
  if (typeof input.welcomeBack !== "boolean") {
    problems.push("welcomeBack must be true or false");
  }
  if (!isWholeMinutes(input.welcomeAfterMinutes)) {
    problems.push(`welcomeAfterMinutes must be a whole number from 1 to ${MAX_MINUTES}`);
  }
  if (typeof input.onboarded !== "boolean") {
    problems.push("onboarded must be true or false");
  }
  return problems;
}
