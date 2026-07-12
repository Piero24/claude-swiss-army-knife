/** Starts the background scan scheduler on first server-side import. */
import "server-only";

import { startScheduler } from "@/lib/scheduler";

let _started = false;

export function ensureScheduler() {
  if (!_started) {
    _started = true;
    startScheduler();
  }
}
