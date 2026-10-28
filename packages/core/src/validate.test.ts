import { describe, expect, it } from "vitest";
import { createDefaultSettings } from "./defaults.ts";
import { parsePack, validatePack, validateSettings } from "./validate.ts";

function validPack() {
  return {
    collection: "Little Interruptions",
    version: "0.1.0",
    locale: "en",
    status: "draft",
    messages: [
      { id: "li-001", category: "gentle_caring", text: "Hey. You don't have to figure everything out right now." },
      { id: "li-011", category: "playful_weird", text: "Your shoulders are trying to become earrings again." },
    ],
  };
}

const problemsText = (input: unknown) => validatePack(input).join("\n");

describe("validatePack", () => {
  it("accepts a well-formed pack", () => {
    expect(validatePack(validPack())).toEqual([]);
  });

  it("rejects something that is not an object", () => {
    expect(validatePack(null).length).toBeGreaterThan(0);
    expect(validatePack("pack").length).toBeGreaterThan(0);
    expect(validatePack([]).length).toBeGreaterThan(0);
  });

  it("requires a collection name", () => {
    expect(problemsText({ ...validPack(), collection: "" })).toContain("collection");
  });

  it("requires a locale", () => {
    expect(problemsText({ ...validPack(), locale: undefined })).toContain("locale");
  });

  it("requires messages to be a non-empty list", () => {
    expect(problemsText({ ...validPack(), messages: "nope" })).toContain("messages");
    expect(problemsText({ ...validPack(), messages: [] })).toContain("messages");
  });

  it("reports duplicate ids", () => {
    const pack = validPack();
    pack.messages.push({ id: "li-001", category: "gentle_caring", text: "Again." });
    expect(problemsText(pack)).toContain("duplicate id li-001");
  });

  it("reports an unknown category and names it", () => {
    const pack = validPack();
    pack.messages.push({ id: "li-050", category: "motivational_poster", text: "Hustle." });
    expect(problemsText(pack)).toContain("motivational_poster");
  });

  it("reports empty or blank text", () => {
    const pack = validPack();
    pack.messages.push({ id: "li-051", category: "gentle_caring", text: "   " });
    expect(problemsText(pack)).toContain("li-051");
  });

  it("accepts text of exactly 100 characters and rejects 101", () => {
    const ok = validPack();
    ok.messages.push({ id: "li-060", category: "gentle_caring", text: "x".repeat(100) });
    expect(validatePack(ok)).toEqual([]);

    const tooLong = validPack();
    tooLong.messages.push({ id: "li-061", category: "gentle_caring", text: "x".repeat(101) });
    expect(problemsText(tooLong)).toContain("li-061");
  });

  it("rejects control characters in text", () => {
    const pack = validPack();
    pack.messages.push({ id: "li-062", category: "gentle_caring", text: "line one\nline two" });
    expect(problemsText(pack)).toContain("li-062");
  });

  it("rejects ids with unsafe characters", () => {
    const pack = validPack();
    pack.messages.push({ id: "../etc/passwd", category: "gentle_caring", text: "Hi." });
    expect(problemsText(pack)).toContain("id");
  });

  it("rejects a message that is not an object", () => {
    const pack = { ...validPack(), messages: [...validPack().messages, 42] };
    expect(validatePack(pack).length).toBeGreaterThan(0);
  });

  it("rejects absurdly large packs", () => {
    const messages = Array.from({ length: 2001 }, (_, i) => ({
      id: `m-${i}`,
      category: "gentle_caring",
      text: "Hi.",
    }));
    expect(problemsText({ ...validPack(), messages })).toContain("2000");
  });
});

describe("parsePack", () => {
  it("returns the pack when it is valid", () => {
    const result = parsePack(validPack());
    expect(result.problems).toEqual([]);
    expect(result.pack?.collection).toBe("Little Interruptions");
    expect(result.pack?.messages).toHaveLength(2);
  });

  it("returns null and the problems when it is not", () => {
    const result = parsePack({ nonsense: true });
    expect(result.pack).toBeNull();
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it("drops unknown extra fields on the pack and its messages", () => {
    const pack = { ...validPack(), evil: "<script>", messages: [{ id: "a", category: "gentle_caring", text: "Hi.", html: "<b>" }] };
    const result = parsePack(pack);
    expect(Object.keys(result.pack ?? {}).sort()).toEqual(["collection", "locale", "messages", "status", "version"]);
    expect(Object.keys(result.pack?.messages[0] ?? {}).sort()).toEqual(["category", "id", "text"]);
  });
});

describe("validateSettings", () => {
  const withChange = (change: Record<string, unknown>) => ({ ...createDefaultSettings(), ...change });

  it("accepts the defaults", () => {
    expect(validateSettings(createDefaultSettings())).toEqual([]);
  });

  it("rejects an interval below one minute or not a whole number", () => {
    expect(validateSettings(withChange({ intervalMinutes: 0 })).length).toBeGreaterThan(0);
    expect(validateSettings(withChange({ intervalMinutes: 1.5 })).length).toBeGreaterThan(0);
  });

  it("rejects an interval above one day", () => {
    expect(validateSettings(withChange({ intervalMinutes: 1441 })).length).toBeGreaterThan(0);
  });

  it("rejects an idle threshold below one minute", () => {
    expect(validateSettings(withChange({ idleMinutes: 0 })).length).toBeGreaterThan(0);
  });

  it("rejects enabledPacks that is not a list of strings", () => {
    expect(validateSettings(withChange({ enabledPacks: "all" })).length).toBeGreaterThan(0);
    expect(validateSettings(withChange({ enabledPacks: [1] })).length).toBeGreaterThan(0);
  });

  it("rejects a missing autoUpdatePacks flag", () => {
    expect(validateSettings(withChange({ autoUpdatePacks: undefined })).length).toBeGreaterThan(0);
  });

  it("rejects a missing soundEnabled flag", () => {
    expect(validateSettings(withChange({ soundEnabled: undefined })).length).toBeGreaterThan(0);
    expect(validateSettings(withChange({ soundEnabled: "yes" })).length).toBeGreaterThan(0);
  });

  it("rejects a missing smartPause or showCountdown flag", () => {
    expect(validateSettings(withChange({ smartPause: undefined })).length).toBeGreaterThan(0);
    expect(validateSettings(withChange({ showCountdown: "yes" })).length).toBeGreaterThan(0);
  });

  it("rejects an unknown settings version", () => {
    expect(validateSettings(withChange({ version: 2 })).length).toBeGreaterThan(0);
  });

  it("rejects something that is not an object", () => {
    expect(validateSettings(null).length).toBeGreaterThan(0);
  });
});

describe("validateSettings: kinds, style and welcome", () => {
  const bad = (change: Record<string, unknown>) => validateSettings({ ...createDefaultSettings(), ...change });

  it("rejects an empty or unknown list of message kinds", () => {
    expect(bad({ enabledCategories: [] })).not.toEqual([]);
    expect(bad({ enabledCategories: ["welcome_back"] })).not.toEqual([]);
    expect(bad({ enabledCategories: ["playful_weird"] })).toEqual([]);
  });

  it("rejects an unknown display style", () => {
    expect(bad({ displayStyle: "hologram" })).not.toEqual([]);
    for (const style of ["card", "overlay", "notification"]) expect(bad({ displayStyle: style })).toEqual([]);
  });

  it("only accepts known sounds", () => {
    expect(bad({ soundChoice: "airhorn" })).not.toEqual([]);
    expect(bad({ soundChoice: "random" })).toEqual([]);
    expect(bad({ soundChoice: "pond" })).toEqual([]);
  });

  it("checks the launch-at-login switch", () => {
    expect(bad({ launchAtLogin: "yes" })).not.toEqual([]);
    expect(bad({ launchAtLogin: false })).toEqual([]);
  });

  it("checks the microphone switch", () => {
    expect(bad({ smartPauseMic: "yes" })).not.toEqual([]);
    expect(bad({ smartPauseMic: false })).toEqual([]);
  });

  it("checks the welcome and onboarding fields", () => {
    expect(bad({ welcomeBack: "yes" })).not.toEqual([]);
    expect(bad({ welcomeAfterMinutes: 0 })).not.toEqual([]);
    expect(bad({ onboarded: 1 })).not.toEqual([]);
  });

  it("accepts welcome_back as a pack message category", () => {
    const pack = {
      collection: "C",
      version: "1",
      locale: "en",
      status: "draft",
      messages: [{ id: "w1", category: "welcome_back", text: "Welcome back." }],
    };
    expect(validatePack(pack)).toEqual([]);
  });
});
