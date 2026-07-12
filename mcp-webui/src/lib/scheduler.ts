/** Background scheduler — periodic folder scans for synology MCP. */
import "server-only";

import { isScanning, touchAutoScan } from "@/lib/scan-status";

const PORT = process.env.PORT || "8280";
const API_KEY = process.env.WEBUI_API_KEY || "";

let _started = false;
let _intervalMs = 60 * 60 * 1000;
let _timer: ReturnType<typeof setInterval> | null = null;

async function runScan() {
  if (isScanning()) {
    console.log("[scheduler] Skipping — manual scan in progress");
    return;
  }
  touchAutoScan();
  try {
    const resp = await fetch(`http://localhost:${PORT}/api/scan/synology-nas`, {
      method: "POST",
      headers: { "x-api-key": API_KEY },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.added > 0) {
        console.log(`[scheduler] Scan added ${data.added} new folder(s)`);
      }
    }
  } catch {
    // Best-effort
  }
}

export function startScheduler() {
  if (_started) return;
  _started = true;
  console.log(`[scheduler] Scan every ${_intervalMs / 60000} min`);
  _timer = setInterval(runScan, _intervalMs);
  setTimeout(() => runScan(), 30000);
}

export function setScanInterval(minutes: number) {
  _intervalMs = minutes * 60 * 1000;
  if (_timer) {
    clearInterval(_timer);
    _timer = setInterval(runScan, _intervalMs);
    console.log(`[scheduler] Interval updated to ${minutes} min`);
  }
}

/** Reset auto-scan timer — called after manual scan completes. */
export function resetScanTimer() {
  if (_timer) {
    clearInterval(_timer);
    _timer = setInterval(runScan, _intervalMs);
    console.log(`[scheduler] Timer reset — next scan in ${_intervalMs / 60000} min`);
  }
}
