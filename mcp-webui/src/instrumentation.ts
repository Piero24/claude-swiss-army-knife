/** Starts the background scan scheduler on first server-side import. */
import "server-only";

import { startScheduler, setScanInterval } from "@/lib/scheduler";

let _started = false;

export function ensureScheduler() {
  if (!_started) {
    _started = true;
    startScheduler();
  }
}

export { setScanInterval };
