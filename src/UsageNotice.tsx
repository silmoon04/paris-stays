import { useState } from "react";
import { Info, X } from "lucide-react";
import type { ConnectionState } from "./telemetry";
export function UsageNotice({ state, enabled, onPause }: { state: ConnectionState; enabled: boolean; onPause: () => void }) {
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem("paris-stays-usage-notice") === "seen"; } catch { return false; } });
  if (dismissed || !enabled || state === "paused") return null;
  return <aside className="usage-notice" aria-label="Optional usage logging">
    <Info size={18} aria-hidden="true" />
    <div><p>Anonymous visits and clicks are logged when the owner's laptop is online. Your written notes stay private.</p><button onClick={onPause}>Pause logging</button></div>
    <button className="icon-button" aria-label="Dismiss usage notice" onClick={() => { setDismissed(true); try { localStorage.setItem("paris-stays-usage-notice", "seen"); } catch { /* Dismiss for this visit. */ } }}><X size={18} /></button>
  </aside>;
}
