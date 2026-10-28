import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellIcon } from "../ui/controls.tsx";

interface BellPayload {
  id: string;
  category: string;
  text: string;
}

const VISIBLE_FOR_MS = 12_000;
/** Matches the exit transition below, so the window hides only once the card has faded. */
const EXIT_MS = 260;
/** After the pointer leaves the card, it waits this long before going away. */
const LINGER_MS = 3_000;

const PREVIEW: BellPayload = {
  id: "preview",
  category: "playful_weird",
  text: "Your shoulders are trying to become earrings again.",
};

function isNative(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export function Popup() {
  const [bell, setBell] = useState<BellPayload | null>(isNative() ? null : PREVIEW);
  const [shown, setShown] = useState(!isNative());
  // Counts bells, so the swing and ripple animations restart for every new one.
  const [ringCount, setRingCount] = useState(0);
  const hideTimer = useRef<number | undefined>(undefined);

  const dismiss = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setShown(false);
    window.setTimeout(() => {
      if (isNative()) void invoke("hide_popup");
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
      // Two frames, so the browser paints the hidden state first and the transition has something to start from.
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

  // Hovering the card means "I'm reading it": hold off dismissing until the pointer leaves.
  const hold = useCallback(() => window.clearTimeout(hideTimer.current), []);
  const release = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(dismiss, LINGER_MS);
  }, [dismiss]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  if (bell === null) return null;

  // In: a soft spring that overshoots a hair. Out: a quicker ease-in fade upwards.
  const motion = shown
    ? "translate-y-0 scale-100 opacity-100 duration-[420ms] ease-spring"
    : "-translate-y-3 scale-95 opacity-0 duration-[260ms] ease-in";

  return (
    <div className="flex h-full w-full items-start justify-center p-2">
      <button
        type="button"
        onClick={dismiss}
        onMouseEnter={hold}
        onMouseLeave={release}
        aria-label="Dismiss message"
        className={`flex w-full cursor-pointer items-center gap-3.5 rounded-card border border-line bg-surface py-3.5 pr-4 pl-3.5 text-left text-ink shadow-[var(--shadow-card)] transition-[transform,opacity] motion-reduce:transition-none ${motion}`}
      >
        <span
          key={ringCount}
          aria-hidden="true"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-ctl bg-chip text-chip-ink"
        >
          <span className="absolute inset-0 animate-ripple rounded-ctl border-2 border-glow motion-reduce:hidden" />
          <span
            className="absolute inset-0 animate-ripple rounded-ctl border-2 border-glow motion-reduce:hidden"
            style={{ animationDelay: "250ms" }}
          />
          <span className="flex origin-[50%_12%] animate-bell-swing motion-reduce:animate-none">
            <BellIcon />
          </span>
        </span>
        <span className="text-[15px] leading-snug font-semibold">{bell.text}</span>
      </button>
    </div>
  );
}
