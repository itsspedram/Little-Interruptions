import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

interface BellPayload {
  id: string;
  category: string;
  text: string;
}

const VISIBLE_FOR_MS = 12_000;
const FADE_MS = 250;

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
  const hideTimer = useRef<number | undefined>(undefined);

  const dismiss = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setShown(false);
    window.setTimeout(() => {
      if (isNative()) void invoke("hide_popup");
    }, FADE_MS);
  }, []);

  useEffect(() => {
    if (!isNative()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void listen<BellPayload>("bell", (event) => {
      window.clearTimeout(hideTimer.current);
      setBell(event.payload);
      window.requestAnimationFrame(() => setShown(true));
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
    <div className="flex h-full w-full items-start justify-center p-2">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss message"
        className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-left shadow-lg shadow-stone-900/10 transition duration-200 ease-out dark:border-stone-700 dark:bg-stone-800 ${
          shown ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
        }`}
      >
        <span aria-hidden="true" className="text-2xl">
          🔔
        </span>
        <span className="text-[15px] leading-snug font-medium text-stone-800 dark:text-stone-100">{bell.text}</span>
      </button>
    </div>
  );
}
