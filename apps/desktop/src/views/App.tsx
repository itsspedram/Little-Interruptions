import { useEngine } from "../engine/useEngine.ts";
import { Onboarding } from "./Onboarding.tsx";
import { SettingsView } from "./Settings.tsx";

/** The settings window: first-run setup until it is finished, the full settings after. */
export function App() {
  const { settings } = useEngine();
  return settings.onboarded ? <SettingsView /> : <Onboarding />;
}
