import type { CSSProperties, ReactNode } from "react";
import { APP_VERSION, isUpdateSourceConfigured } from "../config.ts";
import { engine } from "../engine/engine.ts";
import type { Snapshot } from "../engine/engine.ts";
import { useEngine } from "../engine/useEngine.ts";
import { BellIcon, Button, Progress, Segmented, Toggle } from "../ui/controls.tsx";
import { describeStatus } from "../ui/describe.ts";
import { IntervalPicker, KindPicker, MinutesField, StylePicker } from "../ui/fields.tsx";

function formatChecked(timestamp: number | null, now: number): string {
  if (timestamp === null) return "never";
  const minutes = Math.round((now - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function Card({ title, order, children }: { title: string; order: number; children: ReactNode }) {
  const style: CSSProperties = { animationDelay: `${80 + order * 60}ms` };
  return (
    <section
      className="animate-rise rounded-card border border-line bg-surface p-[18px] motion-reduce:animate-none"
      style={style}
    >
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
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
  const { settings } = snapshot;
  const status = describeStatus(snapshot.status);
  const paused = snapshot.status.kind === "quiet";
  const running = snapshot.status.kind === "running";
  const progress = snapshot.status.kind === "running" ? snapshot.status.progress : 0;

  return (
    <main className="min-h-full bg-ground px-5 py-6 text-ink">
      <header className="mb-5 flex animate-rise items-center gap-3 motion-reduce:animate-none">
        <span className="flex h-10 w-10 items-center justify-center rounded-ctl bg-chip text-chip-ink">
          <BellIcon />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Little Interruptions</h1>
          <p className="text-sm text-muted">A tiny bell that checks in on you.</p>
        </div>
      </header>

      <div className="space-y-4">
        <Card title="Right now" order={0}>
          <div>
            <div className="text-base font-semibold">{status.title}</div>
            <div className="mt-0.5 text-sm text-muted">{status.detail}</div>
          </div>
          <Progress value={progress} live={running} />
          <div className="flex flex-wrap gap-2">
            <Button tone="accent" onClick={() => void engine.ring()}>
              Ring now
            </Button>
            {paused ? (
              <Button onClick={() => engine.resumeNow()}>Back to normal</Button>
            ) : (
              <>
                <Button onClick={() => engine.skipNextBell()} disabled={!running}>
                  Skip next
                </Button>
                <Button onClick={() => engine.pauseFor(60)}>Quiet for 1 hour</Button>
                <Button onClick={() => engine.pauseFor(180)}>3 hours</Button>
              </>
            )}
          </div>
        </Card>

        <Card title="How often" order={1}>
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
          <Toggle
            label="Wait if I'm busy"
            hint="During calls, video and presentations the bell holds back, then rings when you're done. macOS only."
            checked={settings.smartPause}
            onChange={(next) => engine.updateSettings({ smartPause: next })}
          />
          <Toggle
            label="Show time left in the menu bar"
            hint="A small countdown next to the bell icon. macOS only."
            checked={settings.showCountdown}
            onChange={(next) => engine.updateSettings({ showCountdown: next })}
          />
        </Card>

        <Card title="How it appears" order={2}>
          <StylePicker style={settings.displayStyle} />
          <Button onClick={() => void engine.ring()}>Preview</Button>
        </Card>

        <Card title="Messages" order={3}>
          <KindPicker enabled={settings.enabledCategories} />
          <ul className="space-y-2">
            {snapshot.packs.map((pack) => (
              <li key={pack.collection}>
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.enabledPacks.includes(pack.collection)}
                    onChange={(event) => engine.setPackEnabled(pack.collection, event.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="font-medium">{pack.collection}</span>
                  <span className="text-muted">
                    {pack.count} messages · {pack.locale}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Toggle
            label="Say hello when I'm back"
            hint="One short welcome after a long break away from the computer."
            checked={settings.welcomeBack}
            onChange={(next) => engine.updateSettings({ welcomeBack: next })}
          />
          {settings.welcomeBack ? (
            <div className="animate-rise motion-reduce:animate-none">
              <MinutesField
                label="A long break is"
                hint="minutes away"
                value={settings.welcomeAfterMinutes}
                onCommit={(value) => engine.updateSettings({ welcomeAfterMinutes: value })}
              />
            </div>
          ) : null}
          <Toggle
            label="Get new messages automatically"
            hint="Once a day, from GitHub. Nothing about you is sent."
            checked={settings.autoUpdatePacks}
            onChange={(next) => engine.updateSettings({ autoUpdatePacks: next })}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{syncText(snapshot)}</span>
            <Button
              onClick={() => void engine.checkForUpdates()}
              disabled={snapshot.sync.kind === "checking" || !isUpdateSourceConfigured()}
            >
              Check now
            </Button>
          </div>
        </Card>
      </div>

      <footer className="mt-6 text-center text-xs text-muted">
        Version {APP_VERSION} · Everything stays on this computer.
      </footer>
    </main>
  );
}
