/** Shared scan state — used by scan route, scheduler, and cancel endpoint.
 *  Tracks active scanning status independently PER MCP SERVER. */
import "server-only";

const _activeScans = new Set<string>();
const _cancelRequested = new Set<string>();
let _lastAutoScan = 0;

export function isScanning(server?: string): boolean {
  if (server) return _activeScans.has(server);
  return _activeScans.size > 0;
}

export function scanServerName(): string {
  const active = Array.from(_activeScans);
  return active.length > 0 ? active[0] : "";
}

export function startScan(server?: string): void {
  if (server) _activeScans.add(server);
  if (server) _cancelRequested.delete(server);
}

export function endScan(server?: string): void {
  if (server) _activeScans.delete(server);
  if (server) _cancelRequested.delete(server);
  if (!server) {
    _activeScans.clear();
    _cancelRequested.clear();
  }
}

export function cancelScan(server?: string): void {
  if (server) {
    _cancelRequested.add(server);
  } else {
    for (const s of _activeScans) {
      _cancelRequested.add(s);
    }
  }
}

export function isCancelled(server?: string): boolean {
  if (server) return _cancelRequested.has(server);
  return _cancelRequested.size > 0;
}

export function touchAutoScan(): void { _lastAutoScan = Date.now(); }
export function resetScanTimer(): void { _lastAutoScan = Date.now(); }

export function getScanStatus() {
  const active = Array.from(_activeScans);
  return {
    scanning: active.length > 0,
    server: active.length > 0 ? active.join(", ") : "",
    activeServers: active,
    servers: active,
    lastAutoScan: _lastAutoScan,
  };
}
