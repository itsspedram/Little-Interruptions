# Little Interruptions: Core Design

Status: DRAFT v2, waiting for approval. Nothing has been built.

## Intent

Little Interruptions is a free, open-source desktop app that lives in the
menu bar / system tray and, while you are working at your computer, rings a
soft bell at a steady interval and shows one short, gentle, slightly funny
message ("Your shoulders are trying to become earrings again."). It borrows
the idea of the meditation bell used in some Buddhist-inspired NGOs and
hospitals, but with a personality: a calm, curious creature that checks in,
rather than a timer or a wellness poster.

This document covers only the **core**: the pure logic that decides *when*
the next bell rings, *which* message it shows, and *what* settings and saved
state look like. The desktop shell (tray, window, sound, idle detection,
packaging) comes later and only calls the core.

## Goals

- A framework-free TypeScript module with no UI and no desktop-shell
  imports, fully covered by fast unit tests.
- The same core runs on macOS first and Windows later without changes.
- Contributors can improve the project (messages, translations, core logic)
  without installing Rust or any desktop toolchain.
- The app never nags. It respects pauses, idle time and a sleeping computer.

## Non-goals (for the core, v0.1)

- UI, sound, tray icon, notifications, installers, auto-update.
- Detecting idle, lock or sleep. The shell detects them and tells the core.
- Accounts, sync, analytics, any network access.
- AI-generated messages.
- Fixed clock-time schedules and clock-time active windows.
- Per-message time-of-day targeting (a `when` field).
- A Persian pack. It comes later as just another pack.

## Anti-goals

- A burst of missed messages when the computer wakes up.
- Generic wellness-app tone. If a message could appear in any meditation
  app, it does not belong.
- Heavy dependencies for a tiny scheduling problem.

## Decided by the project owner

- Open source, free to install, no accounts, everything local.
- React-based UI; macOS first, Windows later.
- Business logic is built first, as an isolated module.
- **English first.** Persian and other languages arrive later as extra packs.
- Message spacing is a simple, user-chosen interval: presets of 60, 90 and
  120 minutes, or a custom number of minutes.
- **There is no clock-time window.** The bell is active from the moment the
  user starts working and is present at the computer, and not otherwise.
- Messages live in JSON files outside the code, as collections ("packs").
  The first one is `little-interruptions-vol-01.json`: 30 messages in three
  categories (`gentle_caring`, `playful_weird`, `tiny_mindfulness`).
- The pack format uses `id`, `category`, `text` per message and a top-level
  `collection`, `version`, `locale`, `status`.

## My calls (flagged: please accept or reject)

These are my interpretation of "active while the user is at the system".
None were explicitly agreed yet.

1. **Session model.** A *session* starts when the shell reports that the
   user became active (app launched, or first input after an idle gap) and
   ends when the shell reports idle, lock or sleep. Only one session at a
   time.
2. **Session-anchored rings.** Rings fall at `sessionStart + k * interval`
   for `k >= 1`. The first ring comes one full interval after the session
   starts, never at the moment the user sits down.
3. **A new session starts fresh.** After idle, lock or sleep, the previous
   schedule is forgotten. The user returning from lunch is not greeted by an
   immediate or catch-up ring.
4. **Skip, never replay.** If the shell fails to end a session and rings were
   missed, they are dropped; the next ring is the next slot strictly in the
   future.
5. **Idle threshold.** The core provides `isSessionExpired(now,
   lastActivityAt, settings)` using an `idleMinutes` setting (default 5,
   user-adjustable). The shell polls the OS and decides when to call it.
6. **Shuffle bag.** A message does not repeat until every message in the
   enabled pack has been shown once. The bag order is stored in local state.
7. **Pause and snooze are core concepts.** State holds an optional
   `pausedUntil`. "Quiet for an hour" and "until tomorrow" are just ways to
   set it. While paused, the next ring is the first slot at or after
   `pausedUntil`.
8. **Do-not-disturb is not the core's job.** The shell asks the OS and may
   postpone. The core knows only time, settings and state.
9. **Deterministic by construction.** Every function takes `now` as input
   and never reads the system clock or randomness itself. Because the
   schedule is made of durations, time zones, midnight and DST do not
   affect the core.
10. **Versioned JSON** for settings and state, each with a `version` field
    for future migrations.
11. **Message-pack validation** is part of the core: unique ids, known
    categories, non-empty text, a maximum text length of 100 characters. The
    same function is used by contributors' CI.
12. **Tooling:** TypeScript strict mode, Vitest, pnpm, ESM, zero runtime
    dependencies.
13. **Tauri** is my recommendation for the shell (small, light on memory,
    keeps React). It is not decided, and the core does not depend on it.

## Open questions

None blocking, assuming calls 1 to 5 match what you meant. If "active while
at the system" means something else (for example, only during certain
apps, or a daily cap on how many rings), say so before the plan is written.

## Interface sketch (names and shapes are the builder's to finalize)

- `startSession(state, now)` and `endSession(state)` return the new state.
- `nextFireTime(now, settings, state)` returns the next ring as a point in
  time, or `null` if nothing can ring (no active session, disabled).
- `isSessionExpired(now, lastActivityAt, settings)` returns a boolean.
- `pickMessage(pack, state, random)` returns the chosen message and the
  updated state (shuffle bag).
- `validatePack(pack)` returns a list of problems, empty if valid.
- Types: `Settings` (interval minutes, idle minutes, enabled pack ids,
  `version`), `State` (session start, bag order, `pausedUntil`, `version`),
  `MessagePack`.

## Success looks like

- Tests exist and pass for: first ring one interval after start; steady
  slots over a long session; custom intervals; new session after idle gets a
  fresh schedule; a missed slot is skipped, never replayed; pause and snooze
  (including a pause that ends between two slots); no session means no ring;
  idle expiry at and around the threshold; shuffle-bag exhaustion and
  reseeding; an empty or one-message pack; pack validation failures.
- `pnpm test` runs the whole suite in a few seconds with no network and no
  desktop toolchain.
- A contributor can add a pack by dropping a JSON file in and running the
  validator.

## Left to the builder

File layout, exact type names, how the shuffle bag is represented, test
organization, and the README for the core.

---

## v3 additions (after the session model was settled)

- **Daily pack sync.** `shouldCheckForUpdates` (24 h, or clock moved backwards, or never) → desktop shell does one GET per pack from `PACK_BASE_URL` → `mergePack`. Merge: add new ids, update changed text/category, never delete local-only messages, collection must match. Remote data is untrusted (`parsePack`: unknown fields dropped, id regex, ≤100 code points, no control chars, ≤2000 messages). Network failure retries hourly. Only network request the app makes. Setting `autoUpdatePacks` (default on).
- **Settings:** `soundEnabled` added. `parseSettings` / `parseState` rebuild persisted data field by field and never throw.
- **`onTick`:** the shell sends `{now, idleSeconds, gapMs}` every 5 s; core decides to end a session (sleep gap ≥ 60 s or idle ≥ `idleMinutes`), start one (activity within 15 s) and whether to ring.
- **Open:** Tauri not formally confirmed; pack content license undecided; no autostart; DND not respected.

## v4 additions (menu bar, quick panel, smart pause)

- **Smart pause.** `TickInput.busy` (from the shell), `Settings.smartPause` (default on), `State.deferredRing`. A bell that falls due while busy is held and rings once at the first non-busy tick. It is dropped when the session ends (idle, sleep) or the user asks for quiet, and never replays more than once even if the busy stretch spans several slots. The macOS shell derives `busy` from `pmset -g assertions` (display held awake), sampled every 15 s.
- **Status.** `getStatus` / `formatRemaining` / `trayTitle` in core produce what the menu bar title, tooltip and quick panel show. `Settings.showCountdown` hides the menu bar countdown.
- **Quick panel.** A third window (`panel`) opens under the tray icon on left click and closes on blur. It holds no engine; the engine in the settings window emits a `status` event and handles `menu` actions.
- **macOS transparency.** Transparent windows need `macOSPrivateApi` in `tauri.conf.json` and the `macos-private-api` Cargo feature (not App Store compatible).
- **Open:** screen-recording detection, camera/mic detection, Focus/DND, autostart.
