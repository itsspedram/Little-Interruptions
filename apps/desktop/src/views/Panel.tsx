import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { INTERVAL_PRESETS, formatRemaining } from "@little-interruptions/core";
import type { Status } from "@little-interruptions/core";
import { Button, Progress, Segmented } from "../ui/controls.tsx";
import { describeStatus } from "../ui/describe.ts";
import { PANEL_STATUS_EVENT } from "../ui/panelTypes.ts";
import type { PanelPayload } from "../ui/panelTypes.ts";

const PRESETS = INTERVAL_PRESETS.map((minutes) => ({ value: minutes, label: `${minutes / 60}h` }));

const PREVIEW: PanelPayload = {
  status: { kind: "running", nextAt: Date.now() + 42 * 60_000, remainingMs: 42 * 60_000, progress: 0.3 },
  intervalMinutes: 60,
  now: Date.now(),
};

/** Gap between items rising in when the panel opens. */
const STAGGER_MS = 40;

function isNative(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function act(id: string): void {
  if (isNative()) void invoke("panel_action", { id });
  else console.info("[panel]", id);
}

/** One row of the panel; rows rise in one after another each time the panel opens. */
function Row({ order, className = "", children }: { order: number; className?: string; children: ReactNode }) {
  const style: CSSProperties = { animationDelay: `${60 + order * STAGGER_MS}ms` };
  return (
    <div className={`animate-rise motion-reduce:animate-none ${className}`} style={style}>
      {children}
    </div>
  );
}

export function Panel() {
  const [data, setData] = useState<PanelPayload | null>(isNative() ? null : PREVIEW);
  // Bumped every time the panel window gains focus (it is shown), so the entrance animation plays again.
  const [opened, setOpened] = useState(0);

  useEffect(() => {
    if (!isNative()) return;
    const stops: (() => void)[] = [];
    let cancelled = false;
    const keep = (stop: () => void) => {
      if (cancelled) stop();
      else stops.push(stop);
    };

    void listen<PanelPayload>(PANEL_STATUS_EVENT, (event) => setData(event.payload)).then(keep);
    void getCurrentWindow()
      .onFocusChanged((event) => {
        if (event.payload) setOpened((count) => count + 1);
      })
      .then(keep);

    return () => {
      cancelled = true;
      for (const stop of stops) stop();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") act("close");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const status: Status = data?.status ?? { kind: "waiting" };
  const description = describeStatus(status);
  const running = status.kind === "running";
  const preset = (INTERVAL_PRESETS as readonly number[]).includes(data?.intervalMinutes ?? -1)
    ? (data?.intervalMinutes ?? null)
    : null;

  return (
    <div className="h-full w-full p-2">
      <div
        key={opened}
        className="flex h-full origin-top animate-panel-in flex-col rounded-card border border-line bg-surface p-[18px] text-ink shadow-[var(--shadow-card)] motion-reduce:animate-none"
      >
        <Row order={0} className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
          Little Interruptions
        </Row>

        <Row order={1} className="mt-2">
          {running ? (
            <>
              <div className="text-[46px] leading-none font-bold tracking-tight tabular-nums">
                {formatRemaining(status.remainingMs)}
              </div>
              <div className="mt-1.5 text-sm text-muted">until the next drop</div>
            </>
          ) : (
            <>
              <div className="text-xl font-semibold">{description.title}</div>
              <div className="mt-1 text-sm text-muted">{description.detail}</div>
            </>
          )}
        </Row>

        <Row order={2} className="mt-3.5">
          <Progress value={running ? status.progress : 0} live={running} />
          {running && status.busy === true ? (
            <div className="mt-2 text-xs text-muted">Busy right now. The drop will wait for you.</div>
          ) : null}
        </Row>

        <Row order={3} className="mt-4 flex">
          <Button tone="accent" wide onClick={() => act("ring_now")}>
            Drop now
          </Button>
        </Row>

        <Row order={4} className="mt-2 flex gap-2">
          {status.kind === "quiet" ? (
            <Button wide onClick={() => act("resume")}>
              Back to normal
            </Button>
          ) : (
            <>
              <Button wide onClick={() => act("pause_1h")}>
                Quiet 1h
              </Button>
              <Button wide onClick={() => act("pause_3h")}>
                Quiet 3h
              </Button>
            </>
          )}
        </Row>

        <Row order={5} className="mt-4">
          <div className="mb-1.5 text-xs font-medium text-muted">Every</div>
          <Segmented label="Interval" options={PRESETS} value={preset} onChange={(minutes) => act(`interval:${minutes}`)} />
        </Row>

        <Row order={6} className="mt-auto flex items-center justify-between pt-3">
          <Button tone="ghost" onClick={() => act("settings")}>
            Settings…
          </Button>
          <button
            type="button"
            onClick={() => act("quit")}
            className="rounded-ctl px-3 py-2 text-sm text-muted transition-colors hover:text-ink"
          >
            Quit
          </button>
        </Row>
      </div>
    </div>
  );
}
