import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { INTERVAL_PRESETS } from "@little-interruptions/core";
import { APP_VERSION, isUpdateSourceConfigured } from "../config.ts";
import { engine } from "../engine/engine.ts";
import type { Snapshot } from "../engine/engine.ts";
import { useEngine } from "../engine/useEngine.ts";

const formatTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function formatChecked(timestamp: number | null, now: number): string {
  if (timestamp === null) return "never";
  const minutes = Math.round((now - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Button({
  children,
  onClick,
  disabled = false,
  tone = "neutral",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "accent";
}) {
  const colors =
    tone === "accent"
      ? "bg-amber-500 text-white hover:bg-amber-600"
      : "bg-stone-100 text-stone-800 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-100 dark:hover:bg-stone-600";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${colors}`}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-stone-800 dark:text-stone-100">{label}</div>
        {hint ? <div className="text-xs text-stone-500 dark:text-stone-400">{hint}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-amber-500" : "bg-stone-300 dark:bg-stone-600"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

/** A whole-number-of-minutes field that applies on blur or Enter and explains itself when wrong. */
function MinutesField({
  label,
  hint,
  value,
  onCommit,
}: {
  label: string;
  hint?: string;
  value: number;
  onCommit: (minutes: number) => string[];
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(value));
    setError(null);
  }, [value]);

  const commit = () => {
    const problems = onCommit(Number(draft));
    setError(problems.length > 0 ? "Enter a whole number of minutes from 1 to 1440." : null);
  };

  return (
    <label className="flex items-center justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-stone-800 dark:text-stone-100">{label}</span>
        {hint ? <span className="block text-xs text-stone-500 dark:text-stone-400">{hint}</span> : null}
        {error ? <span className="block text-xs text-red-600 dark:text-red-400">{error}</span> : null}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={1440}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1 text-right text-sm text-stone-800 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
      />
    </label>
  );
}

const PRESET_LABELS: Record<number, string> = { 60: "1 hour", 90: "1.5 hours", 120: "2 hours" };

function IntervalPicker({ minutes }: { minutes: number }) {
  const isPreset = (INTERVAL_PRESETS as readonly number[]).includes(minutes);
  const [customChosen, setCustomChosen] = useState(!isPreset);
  const showCustom = customChosen || !isPreset;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-900" role="group" aria-label="Interval">
        {INTERVAL_PRESETS.map((preset) => {
          const active = !showCustom && minutes === preset;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setCustomChosen(false);
                engine.updateSettings({ intervalMinutes: preset });
              }}
              className={`rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white"
                  : "text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white"
              }`}
            >
              {PRESET_LABELS[preset]}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={showCustom}
          onClick={() => setCustomChosen(true)}
          className={`rounded-lg px-2 py-1.5 text-sm font-medium transition ${
            showCustom
              ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white"
              : "text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white"
          }`}
        >
          Custom
        </button>
      </div>
      {showCustom ? (
        <MinutesField
          label="Every"
          hint="minutes"
          value={minutes}
          onCommit={(value) => engine.updateSettings({ intervalMinutes: value })}
        />
      ) : null}
    </div>
  );
}

function statusLine(snapshot: Snapshot): { title: string; detail: string } {
  const { state, nextFireAt, now } = snapshot;
  if (state.pausedUntil !== null && state.pausedUntil > now) {
    return { title: `Quiet until ${formatTime(state.pausedUntil)}`, detail: "No bells until then." };
  }
  if (state.sessionStartedAt !== null && nextFireAt !== null) {
    return { title: `Next bell around ${formatTime(nextFireAt)}`, detail: "You're here, so the clock is running." };
  }
  return {
    title: "Resting",
    detail: "The bell starts counting when you're back at the keyboard.",
  };
}

function syncText(snapshot: Snapshot): string {
  const { sync, state, now } = snapshot;
  switch (sync.kind) {
    case "checking":
      return "Checking for new messages…";
    case "error":
      return sync.message;
    case "unconfigured":
      return "No update source is set in this build.";
    case "idle":
      return sync.message ?? `Last checked ${formatChecked(state.lastPackCheckAt, now)}.`;
  }
}

export function SettingsView() {
  const snapshot = useEngine();
  const { settings, state, now } = snapshot;
  const status = statusLine(snapshot);
  const paused = state.pausedUntil !== null && state.pausedUntil > now;

  return (
    <main className="min-h-full bg-stone-50 px-5 py-5 text-stone-800 dark:bg-stone-900 dark:text-stone-100">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Little Interruptions</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">A tiny bell that checks in on you.</p>
      </header>

      <div className="space-y-4">
        <Card title="Right now">
          <div>
            <div className="text-base font-semibold">{status.title}</div>
            <div className="text-sm text-stone-500 dark:text-stone-400">{status.detail}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void engine.ring()} tone="accent">
              Ring now
            </Button>
            <Button onClick={() => engine.pauseFor(60)}>Quiet for 1 hour</Button>
            <Button onClick={() => engine.pauseFor(180)}>3 hours</Button>
            {paused ? <Button onClick={() => engine.resumeNow()}>Back to normal</Button> : null}
          </div>
        </Card>

        <Card title="How often">
          <IntervalPicker minutes={settings.intervalMinutes} />
          <MinutesField
            label="Treat me as away after"
            hint="minutes without keyboard or mouse"
            value={settings.idleMinutes}
            onCommit={(value) => engine.updateSettings({ idleMinutes: value })}
          />
          <Toggle
            label="Play the bell sound"
            checked={settings.soundEnabled}
            onChange={(next) => engine.updateSettings({ soundEnabled: next })}
          />
        </Card>

        <Card title="Messages">
          <ul className="space-y-2">
            {snapshot.packs.map((pack) => (
              <li key={pack.collection}>
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.enabledPacks.includes(pack.collection)}
                    onChange={(event) => engine.setPackEnabled(pack.collection, event.target.checked)}
                    className="h-4 w-4 accent-amber-500"
                  />
                  <span className="font-medium">{pack.collection}</span>
                  <span className="text-stone-500 dark:text-stone-400">
                    {pack.count} messages · {pack.locale}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Toggle
            label="Get new messages automatically"
            hint="Once a day, from GitHub. Nothing about you is sent."
            checked={settings.autoUpdatePacks}
            onChange={(next) => engine.updateSettings({ autoUpdatePacks: next })}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-stone-500 dark:text-stone-400">{syncText(snapshot)}</span>
            <Button
              onClick={() => void engine.checkForUpdates()}
              disabled={snapshot.sync.kind === "checking" || !isUpdateSourceConfigured()}
            >
              Check now
            </Button>
          </div>
        </Card>
      </div>

      <footer className="mt-5 text-center text-xs text-stone-400 dark:text-stone-500">
        Version {APP_VERSION} · Everything stays on this computer.
      </footer>
    </main>
  );
}
