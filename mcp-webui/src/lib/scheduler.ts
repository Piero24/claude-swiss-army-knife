/** Background scheduler — periodic folder scans and log maintenance. */
import "server-only";

import { isScanning, touchAutoScan } from "@/lib/scan-status";

const PORT = process.env.PORT || "8280";
const API_KEY = process.env.WEBUI_API_KEY || "";

const SCAN_SERVERS = ["synology-nas", "obsidian", "ubuntu-server"];

let _started = false;
let _intervalMs = 60 * 60 * 1000;
let _timer: ReturnType<typeof setInterval> | null = null;
let _logMaintenanceTimer: ReturnType<typeof setInterval> | null = null;

async function runLogMaintenance() {
  try {
    if (!(await hasUsers())) return;
    const { runLogMaintenance: doMaintenance } = await import(
      "@/lib/log-cleanup"
    );
    await doMaintenance();
  } catch (err) {
    console.error("[scheduler] Log maintenance failed:", err);
  }
}

async function runScanForServer(server: string) {
  if (isScanning(server)) {
    console.log(`[scheduler] ${server} — skipped: scan already in progress`);
    return;
  }
  try {
    const resp = await fetch(`http://localhost:${PORT}/api/scan/${server}`, {
      method: "POST",
      headers: { "x-api-key": API_KEY },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.added > 0) {
        console.log(`[scheduler] ${server} — ${data.added} new folder(s)`);
      } else if (data.error) {
        console.log(`[scheduler] ${server} — ${data.error}`);
      }
    }
  } catch {
    // Best-effort per server
  }
}

async function runAllScans() {
  if (!(await hasUsers())) {
    console.log("[scheduler] No users — skipping scan cycle");
    return;
  }
  touchAutoScan();
  await Promise.allSettled(SCAN_SERVERS.map((server) => runScanForServer(server)));
}

async function hasUsers(): Promise<boolean> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const yaml = await import("js-yaml");
    const configsDir = process.env.CONFIGS_PATH || "/app/configs";
    const usersPath = path.join(configsDir, "users.yaml");
    const raw = await fs.readFile(usersPath, "utf-8");
    const data = yaml.load(raw) as Record<string, unknown>;
    return Array.isArray(data?.users) && (data.users as unknown[]).length > 0;
  } catch {
    return false;
  }
}

export function startScheduler() {
  if (_started) return;
  _started = true;
  console.log(`[scheduler] Scan every ${_intervalMs / 60000} min`);
  _timer = setInterval(runAllScans, _intervalMs);

  // Log maintenance: once every 24 hours (rotation + cleanup)
  const MAINTENANCE_MS = 24 * 60 * 60 * 1000;
  _logMaintenanceTimer = setInterval(runLogMaintenance, MAINTENANCE_MS);
  console.log("[scheduler] Log maintenance every 24h");

  setTimeout(async () => {
    if (await hasUsers()) {
      runAllScans();
      // Run log maintenance on startup too (with a 60s delay so scans settle)
      setTimeout(runLogMaintenance, 60_000);
    } else {
      console.log("[scheduler] No users configured — skipping auto-scan");
    }
  }, 30000);
}

export function setScanInterval(minutes: number) {
  _intervalMs = minutes * 60 * 1000;
  if (_timer) {
    clearInterval(_timer);
    _timer = setInterval(runAllScans, _intervalMs);
    console.log(`[scheduler] Interval updated to ${minutes} min`);
  }
}

/** Reset auto-scan timer — called after manual scan completes. */
export function resetScanTimer() {
  if (_timer) {
    clearInterval(_timer);
    _timer = setInterval(runAllScans, _intervalMs);
    console.log(`[scheduler] Timer reset — next scan in ${_intervalMs / 60000} min`);
  }
}
