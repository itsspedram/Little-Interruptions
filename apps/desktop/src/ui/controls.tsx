import type { ReactNode } from "react";

/** The app mark (a drop), drawn as a line icon so it looks the same everywhere and can settle like a drop. The name is kept from when it was a bell. */
export function BellIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.2C12 3.2 7.4 8.8 7.4 12.2a4.6 4.6 0 0 0 9.2 0C16.6 8.8 12 3.2 12 3.2Z" />
      <path d="M4.5 19c1.7 1.2 4.3 1.9 7.5 1.9s5.8-.7 7.5-1.9" />
    </svg>
  );
}

const BUTTON_TONES = {
  accent: "bg-accent text-on-accent font-semibold",
  soft: "bg-soft text-ink font-medium",
  ghost: "bg-transparent text-ink font-medium",
} as const;

export function Button({
  children,
  onClick,
  tone = "soft",
  disabled = false,
  wide = false,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: keyof typeof BUTTON_TONES;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${wide ? "flex-1" : ""} rounded-ctl px-3.5 py-2 text-sm transition duration-150 ease-out-soft hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 motion-reduce:transition-none ${BUTTON_TONES[tone]}`}
    >
      {children}
    </button>
  );
}

/** A switch whose knob glides with a little spring and whose track fades to the accent. */
export function Toggle({
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
        <div className="text-sm font-medium text-ink">{label}</div>
        {hint ? <div className="mt-0.5 text-xs text-muted">{hint}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="relative h-[26px] w-11 shrink-0 rounded-full bg-toggle-off"
      >
        <span
          aria-hidden="true"
          className={`absolute inset-0 rounded-full bg-accent transition-opacity duration-300 motion-reduce:transition-none ${
            checked ? "opacity-100" : "opacity-0"
          }`}
        />
        <span
          aria-hidden="true"
          className={`absolute top-[3px] left-[3px] h-5 w-5 rounded-full bg-knob shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform duration-300 ease-spring motion-reduce:transition-none ${
            checked ? "translate-x-[18px]" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export interface SegmentOption<T> {
  value: T;
  label: string;
}

/** A row of choices whose highlight slides to the picked one instead of jumping. `value` null highlights nothing. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly SegmentOption<T>[];
  value: T | null;
  onChange: (next: T) => void;
  label: string;
}) {
  const index = options.findIndex((option) => option.value === value);
  const count = options.length;
  return (
    <div
      role="group"
      aria-label={label}
      className="relative grid rounded-ctl bg-well p-1"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 bottom-1 left-1 rounded-thumb bg-thumb shadow-[var(--shadow-thumb)] transition-[transform,opacity] duration-300 ease-glide motion-reduce:transition-none ${
          index < 0 ? "opacity-0" : "opacity-100"
        }`}
        style={{ width: `calc((100% - 8px) / ${count})`, transform: `translateX(${Math.max(index, 0) * 100}%)` }}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`relative rounded-thumb px-2 py-1.5 text-sm font-medium transition-colors duration-200 ${
              active ? "text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** How far through the current interval we are, with a slow light sweep while the clock runs. */
export function Progress({ value, live }: { value: number; live: boolean }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-track" aria-hidden="true">
      <div
        className="relative h-full overflow-hidden rounded-full bg-linear-to-r from-fill-from to-fill-to transition-[width] duration-700 ease-out-soft motion-reduce:transition-none"
        style={{ width: `${percent}%` }}
      >
        {live && percent > 0 ? (
          <span className="absolute inset-y-0 left-0 w-2/5 animate-sweep bg-linear-to-r from-transparent via-white/50 to-transparent motion-reduce:hidden" />
        ) : null}
      </div>
    </div>
  );
}
