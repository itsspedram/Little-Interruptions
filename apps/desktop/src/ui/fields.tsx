import { useEffect, useState } from "react";
import { INTERVAL_PRESETS } from "@little-interruptions/core";
import { engine } from "../engine/engine.ts";
import { invoke } from "@tauri-apps/api/core";
import { SOUND_CHOICES, SOUND_IDS, pickSound } from "@little-interruptions/core";
import type { DisplayStyle, Settings, SoundChoice } from "@little-interruptions/core";
import { Button, Segmented } from "./controls.tsx";
import type { SegmentOption } from "./controls.tsx";
import { KIND_LABELS, SOUND_LABELS } from "./describe.ts";

/** A whole-number-of-minutes field that applies on blur or Enter and explains itself when wrong. */
export function MinutesField({
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
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
        {error ? <span className="mt-0.5 block text-xs text-red-600 dark:text-red-300">{error}</span> : null}
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
        className="w-20 rounded-ctl border border-line bg-well px-3 py-1.5 text-right text-sm text-ink tabular-nums transition-shadow outline-none focus:ring-2 focus:ring-accent/50"
      />
    </label>
  );
}

type IntervalChoice = number | "custom";

const INTERVAL_OPTIONS: { value: IntervalChoice; label: string }[] = [
  ...INTERVAL_PRESETS.map((minutes) => ({ value: minutes, label: minutes === 90 ? "1.5 hours" : `${minutes / 60} hour${minutes > 60 ? "s" : ""}` })),
  { value: "custom", label: "Custom" },
];

export function IntervalPicker({ minutes }: { minutes: number }) {
  const isPreset = (INTERVAL_PRESETS as readonly number[]).includes(minutes);
  const [customChosen, setCustomChosen] = useState(!isPreset);
  const showCustom = customChosen || !isPreset;

  return (
    <div className="space-y-4">
      <Segmented<IntervalChoice>
        label="Interval"
        options={INTERVAL_OPTIONS}
        value={showCustom ? "custom" : minutes}
        onChange={(choice) => {
          if (choice === "custom") {
            setCustomChosen(true);
            return;
          }
          setCustomChosen(false);
          engine.updateSettings({ intervalMinutes: choice });
        }}
      />
      {showCustom ? (
        <div className="animate-rise motion-reduce:animate-none">
          <MinutesField
            label="Every"
            hint="minutes"
            value={minutes}
            onCommit={(value) => engine.updateSettings({ intervalMinutes: value })}
          />
        </div>
      ) : null}
    </div>
  );
}

/** A pill that is either on or off; used to pick which kinds of message to see. */
export function Chip({
  on,
  label,
  hint,
  onToggle,
}: {
  on: boolean;
  label: string;
  hint: string;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onToggle(!on)}
      className={`flex-1 rounded-card border px-3 py-2.5 text-left transition duration-200 ease-out-soft active:scale-[0.97] motion-reduce:transition-none ${
        on ? "border-accent bg-soft text-ink" : "border-line bg-transparent text-muted hover:text-ink"
      }`}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className="mt-0.5 block text-xs leading-snug">{hint}</span>
    </button>
  );
}

/** Which kinds of message may be shown. The last one cannot be switched off. */
export function KindPicker({ enabled }: { enabled: readonly string[] }) {
  return (
    <div className="flex gap-2">
      {Object.entries(KIND_LABELS).map(([category, { label, hint }]) => (
        <Chip
          key={category}
          on={enabled.includes(category)}
          label={label}
          hint={hint}
          onToggle={(next) => engine.setCategoryEnabled(category, next)}
        />
      ))}
    </div>
  );
}

const STYLE_OPTIONS: readonly SegmentOption<DisplayStyle>[] = [
  { value: "card", label: "Card" },
  { value: "overlay", label: "Overlay" },
  { value: "notification", label: "Notification" },
];

export const STYLE_HINTS: Record<DisplayStyle, string> = {
  card: "A small card in the corner of the screen.",
  overlay: "A soft, translucent layer over the screen. Click or press Esc to close it.",
  notification: "A normal system notification. It respects Do Not Disturb.",
};

/** How a bell is shown, with a line explaining the chosen way. */
export function StylePicker({ style }: { style: DisplayStyle }) {
  return (
    <div className="space-y-2">
      <Segmented<DisplayStyle>
        label="How a drop appears"
        options={STYLE_OPTIONS}
        value={style}
        onChange={(next) => engine.updateSettings({ displayStyle: next })}
      />
      <p className="text-xs text-muted">{STYLE_HINTS[style]}</p>
    </div>
  );
}

/** Which drop sound plays, with a button to hear it. "Random" previews a random one. */
export function SoundPicker({ settings }: { settings: Settings }) {
  const preview = () => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    void invoke("play_sound", { name: pickSound(settings, Math.random) });
  };
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="sound-choice">
        Sound
      </label>
      <select
        id="sound-choice"
        value={settings.soundChoice}
        onChange={(event) => {
          engine.updateSettings({ soundChoice: event.target.value as SoundChoice });
        }}
        className="min-w-0 flex-1 rounded-ctl border border-line bg-well px-3.5 py-2 text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-accent/50"
      >
        {SOUND_CHOICES.map((choice) => (
          <option key={choice} value={choice}>
            {SOUND_LABELS[choice]}
            {choice === "random" ? ` (one of ${SOUND_IDS.length})` : ""}
          </option>
        ))}
      </select>
      <Button onClick={preview}>Listen</Button>
    </div>
  );
}
