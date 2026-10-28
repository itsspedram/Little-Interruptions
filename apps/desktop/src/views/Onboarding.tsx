import { useState } from "react";
import type { ReactNode } from "react";
import { engine } from "../engine/engine.ts";
import { useEngine } from "../engine/useEngine.ts";
import { BellIcon, Button, Toggle } from "../ui/controls.tsx";
import { IntervalPicker, KindPicker, SoundPicker, StylePicker } from "../ui/fields.tsx";

const STEPS = 3;

function Step({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className="animate-rise space-y-5 motion-reduce:animate-none">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted">{lead}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/** First-run setup: three short steps, every answer can be changed later in Settings. */
export function Onboarding() {
  const { settings } = useEngine();
  const [step, setStep] = useState(0);
  const last = step === STEPS - 1;

  return (
    <main className="flex min-h-full flex-col bg-ground px-6 py-7 text-ink">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-ctl bg-chip text-chip-ink">
          <BellIcon />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome</h1>
          <p className="text-sm text-muted">Three quick choices. You can change them any time.</p>
        </div>
      </header>

      <section className="flex-1 rounded-card border border-line bg-surface p-5">
        {step === 0 ? (
          <Step key="interval" title="How often should I ring?" lead="The bell only counts while you're at the computer.">
            <IntervalPicker minutes={settings.intervalMinutes} />
          </Step>
        ) : null}

        {step === 1 ? (
          <Step key="kinds" title="What would you like to hear?" lead="Pick one or more. I'll mix them.">
            <KindPicker enabled={settings.enabledCategories} />
            <Toggle
              label="Say hello when I'm back"
              hint="One short welcome after a long break."
              checked={settings.welcomeBack}
              onChange={(next) => engine.updateSettings({ welcomeBack: next })}
            />
          </Step>
        ) : null}

        {step === 2 ? (
          <Step key="behaviour" title="How should it behave?" lead="Gentle defaults. Try the bell to hear it.">
            <StylePicker style={settings.displayStyle} />
            <Toggle
              label="Play a water-drop sound"
              checked={settings.soundEnabled}
              onChange={(next) => engine.updateSettings({ soundEnabled: next })}
            />
            {settings.soundEnabled ? <SoundPicker settings={settings} /> : null}
            <Toggle
              label="Wait if I'm busy"
              hint="Holds back during calls and presentations. macOS only."
              checked={settings.smartPause}
              onChange={(next) => engine.updateSettings({ smartPause: next })}
            />
            <Toggle
              label="Open at login"
              hint="Starts quietly in the menu bar."
              checked={settings.launchAtLogin}
              onChange={(next) => engine.updateSettings({ launchAtLogin: next })}
            />
            <Toggle
              label="Show time left in the menu bar"
              checked={settings.showCountdown}
              onChange={(next) => engine.updateSettings({ showCountdown: next })}
            />
            <Button onClick={() => void engine.ring()}>Try the bell</Button>
          </Step>
        ) : null}
      </section>

      <footer className="mt-5 flex items-center justify-between">
        <div className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full transition-all duration-300 ease-out-soft motion-reduce:transition-none ${
                index === step ? "w-5 bg-accent" : "w-1.5 bg-toggle-off"
              }`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {step > 0 ? <Button tone="ghost" onClick={() => setStep(step - 1)}>Back</Button> : null}
          <Button
            tone="accent"
            onClick={() => (last ? void engine.updateSettings({ onboarded: true }) : setStep(step + 1))}
          >
            {last ? "Start" : "Next"}
          </Button>
        </div>
      </footer>
    </main>
  );
}
