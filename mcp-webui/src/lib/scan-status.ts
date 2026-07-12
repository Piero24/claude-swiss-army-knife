/** Shared scan state — used by scan route, scheduler, and cancel endpoint. */
import "server-only";

let _scanning = false;
let _scanServer = "";
let _cancelRequested = false;
let _lastAutoScan = 0;

export function isScanning(): boolean { return _scanning; }
export function scanServerName(): string { return _scanServer; }

export function startScan(server?: string): void {
  _scanning = true;
  _scanServer = server || "";
  _cancelRequested = false;
}

export function endScan(): void {
  _scanning = false;
  _scanServer = "";
  _cancelRequested = false;
}

export function cancelScan(): void { _cancelRequested = true; }
export function isCancelled(): boolean { return _cancelRequested; }
export function touchAutoScan(): void { _lastAutoScan = Date.now(); }
export function resetScanTimer(): void { _lastAutoScan = Date.now(); }

export function getScanStatus() {
  return { scanning: _scanning, server: _scanServer, lastAutoScan: _lastAutoScan };
}
