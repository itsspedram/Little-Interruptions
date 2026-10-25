import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellIcon } from "../ui/controls.tsx";

interface BellPayload {
  id: string;
  category: string;
  text: string;
}

const VISIBLE_FOR_MS = 20_000;
/** Matches the fade-out below, so the window hides only once the layer is gone. */
const EXIT_MS = 320;

const PREVIEW: BellPayload = {
  id: "preview",
  category: "gentle_caring",
  text: "You don't have to earn a moment of peace.",
};

function isNative(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

/** The whole-screen version of a bell: a translucent tint, the message in the middle, any click closes it. */
export function Overlay() {
  const [bell, setBell] = useState<BellPayload | null>(isNative() ? null : PREVIEW);
  const [shown, setShown] = useState(!isNative());
  const [ringCount, setRingCount] = useState(0);
  const hideTimer = useRef<number | undefined>(undefined);

  const dismiss = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setShown(false);
    window.setTimeout(() => {
      if (isNative()) void invoke("hide_overlay");
    }, EXIT_MS);
  }, []);

  useEffect(() => {
    if (!isNative()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void listen<BellPayload>("bell", (event) => {
      window.clearTimeout(hideTimer.current);
      setShown(false);
      setBell(event.payload);
      setRingCount((count) => count + 1);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => setShown(true)));
      hideTimer.current = window.setTimeout(dismiss, VISIBLE_FOR_MS);
    }).then((stop) => {
      if (cancelled) stop();
      else unlisten = stop;
    });

    return () => {
      cancelled = true;
      unlisten?.();
      window.clearTimeout(hideTimer.current);
    };
  }, [dismiss]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  if (bell === null) return null;

  return (
    <button
      type="button"
      onClick={dismiss}
      aria-label="Dismiss message"
      className={`flex h-full w-full cursor-pointer flex-col items-center justify-center gap-7 bg-ground/80 px-10 text-ink transition-opacity duration-[320ms] ease-out-soft motion-reduce:transition-none ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    >
      <span
        key={ringCount}
        aria-hidden="true"
        className="relative flex h-16 w-16 items-center justify-center rounded-ctl bg-chip text-chip-ink"
      >
        <span className="absolute inset-0 animate-ripple rounded-ctl border-2 border-glow motion-reduce:hidden" />
        <span
          className="absolute inset-0 animate-ripple rounded-ctl border-2 border-glow motion-reduce:hidden"
          style={{ animationDelay: "250ms" }}
        />
        <span className="flex origin-[50%_12%] animate-bell-swing motion-reduce:animate-none">
          <BellIcon size={30} />
        </span>
      </span>
      <span
        className={`max-w-2xl text-center text-3xl leading-snug font-semibold tracking-tight transition-[transform,opacity] duration-500 ease-out-soft motion-reduce:transition-none ${
          shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        {bell.text}
      </span>
      <span className="text-sm text-muted">Click anywhere or press Esc</span>
    </button>
  );
}
