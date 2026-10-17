import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

async function bootstrap(): Promise<void> {
  const container = document.getElementById("root");
  if (container === null) throw new Error("Missing #root element");
  const root = createRoot(container);

  const view = new URLSearchParams(window.location.search).get("view");

  if (view === "popup") {
    // The popup never loads the engine; it only shows what it is told to.
    document.documentElement.dataset["view"] = "popup";
    const { Popup } = await import("./views/Popup.tsx");
    root.render(
      <StrictMode>
        <Popup />
      </StrictMode>,
    );
    return;
  }

  const { engine } = await import("./engine/engine.ts");
  const { SettingsView } = await import("./views/Settings.tsx");
  engine.start();
  root.render(
    <StrictMode>
      <SettingsView />
    </StrictMode>,
  );
}

void bootstrap();
