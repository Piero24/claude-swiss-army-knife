/** Background scheduler — periodic folder scans for synology MCP. */

const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const PORT = process.env.PORT || "8280";
const API_KEY = process.env.WEBUI_API_KEY || "";

let _started = false;

async function runScan() {
  try {
    const resp = await fetch(`http://localhost:${PORT}/api/scan/synology-nas`, {
      method: "POST",
      headers: { "x-api-key": API_KEY },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.added > 0) {
        console.log(`[scheduler] Scan added ${data.added} new folder(s)`);
      } else {
        console.log(`[scheduler] Scan OK — ${data.total} folders, nothing new`);
      }
    } else {
      console.log(`[scheduler] Scan returned ${resp.status}`);
    }
  } catch (err) {
    console.log(`[scheduler] Scan failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function startScheduler() {
  if (_started) return;
  _started = true;
  console.log(`[scheduler] Background scan every ${SCAN_INTERVAL_MS / 60000} min`);
  setTimeout(() => { runScan(); setInterval(runScan, SCAN_INTERVAL_MS); }, 30000);
}
