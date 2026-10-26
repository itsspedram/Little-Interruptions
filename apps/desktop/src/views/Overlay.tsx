import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
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
/** Sent when the user closes one overlay, so the one on every screen fades out together. */
const DISMISS_EVENT = "overlay-dismiss";

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

  /** Fade this overlay out and hide the windows once it is gone. */
  const fadeOut = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setShown(false);
    window.setTimeout(() => {
      if (isNative()) void invoke("hide_overlay");
    }, EXIT_MS);
  }, []);

  /** The user closed this overlay: tell all of them. */
  const dismiss = useCallback(() => {
    if (isNative()) void emit(DISMISS_EVENT);
    else fadeOut();
  }, [fadeOut]);

  const present = useCallback(
    (payload: BellPayload) => {
      window.clearTimeout(hideTimer.current);
      setShown(false);
      setBell(payload);
      setRingCount((count) => count + 1);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => setShown(true)));
      hideTimer.current = window.setTimeout(fadeOut, VISIBLE_FOR_MS);
    },
    [fadeOut],
  );

  useEffect(() => {
    if (!isNative()) return;
    const stops: (() => void)[] = [];
    let cancelled = false;
    const keep = (stop: () => void) => {
      if (cancelled) stop();
      else stops.push(stop);
    };

    void listen<BellPayload>("bell", (event) => present(event.payload)).then(keep);
    void listen(DISMISS_EVENT, () => fadeOut()).then(keep);
    // A window created just for this bell was not listening in time; it asks for its bell instead.
    void invoke<BellPayload | null>("take_pending_bell").then((pending) => {
      if (pending !== null && !cancelled) present(pending);
    });

    return () => {
      cancelled = true;
      for (const stop of stops) stop();
      window.clearTimeout(hideTimer.current);
    };
  }, [present, fadeOut]);

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
