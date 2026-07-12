/** POST scan — discover new folders and merge with YAML config.
 *
 *  Synology NAS: breadth-first traversal with bounded concurrency
 *  (SCAN_CONCURRENCY parallel DSM calls), visited-set cycle detection,
 *  paginated folder listing, retry on transient failures. */

import { NextResponse } from "next/server";
import http from "http";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { getConfigPath } from "@/lib/config";
import {
  isExcluded,
  SCAN_CONCURRENCY,
  SCAN_MAX_DEPTH,
} from "@/lib/scan-constants";
import {
  dsmLogin,
  listShares,
  listSubfoldersPaginated,
} from "@/lib/dsm-client";

// ---------------------------------------------------------------------------
// Docker socket helpers (specific to this route — not moved to dsm-client)
// ---------------------------------------------------------------------------

function dockerRequest(p: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: "/var/run/docker.sock", path: p, method: "GET" },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); } catch {
            reject(new Error(data.slice(0, 200)));
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

async function getContainerEnv(
  container: string,
): Promise<Map<string, string>> {
  const info = await dockerRequest(`/containers/${container}/json`);
  const cfg = info.Config as { Env?: string[] } | undefined;
  const map = new Map<string, string>();
  for (const e of cfg?.Env || []) {
    const eq = e.indexOf("=");
    if (eq > 0) map.set(e.slice(0, eq), e.slice(eq + 1));
  }
  return map;
}

// ---------------------------------------------------------------------------
// Concurrency limiter (inline — no external dependency)
// ---------------------------------------------------------------------------

/**
 * Process `items` through `fn` with at most `concurrency` promises in flight.
 * Preserves result order (result[i] corresponds to items[i]).
 */
async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  const executing = new Set<Promise<void>>();
  let index = 0;

  async function enqueue(): Promise<void> {
    if (index >= items.length) return;
    const i = index++;
    const p = fn(items[i]).then((r) => { results[i] = r; });
    // Track this promise; remove it when settled
    const tracked = p.then(
      () => { executing.delete(tracked); },
      () => { executing.delete(tracked); },
    );
    executing.add(tracked);
    // If pool is full, wait for one to finish before starting more
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
    return enqueue();
  }

  // Seed the pool with initial tasks
  const starters = Math.min(concurrency, items.length);
  const seeds: Promise<void>[] = [];
  for (let s = 0; s < starters; s++) seeds.push(enqueue());
  await Promise.all(seeds);
  // Wait for remaining in-flight
  if (executing.size > 0) await Promise.all(executing);

  return results;
}

// ---------------------------------------------------------------------------
// BFS scan with parallel level expansion
// ---------------------------------------------------------------------------

async function scanSynology(): Promise<string[]> {
  const env = await getContainerEnv("synology-mcp");
  const host = env.get("SYNOLOGY_NAS_HOST") || "";
  const port = env.get("SYNOLOGY_NAS_PORT") || "5001";
  const user = env.get("SYNOLOGY_NAS_USER") || "";
  const pass = env.get("SYNOLOGY_NAS_PASSWORD") || "";
  const otpSecret = env.get("SYNOLOGY_NAS_OTP_SECRET") || "";
  const base = `https://${host}:${port}`;

  const sid = await dsmLogin(base, user, pass, otpSecret);
  const shares = await listShares(base, sid);

  const allFolders: string[] = [];
  const visited = new Set<string>();

  for (const share of shares) {
    if (isExcluded(share)) continue;
    if (visited.has(share)) continue;
    visited.add(share);
    allFolders.push(share);

    // BFS: expand one level at a time, listing children in parallel
    let currentLevel = [share];
    let depth = 1;

    while (currentLevel.length > 0 && depth < SCAN_MAX_DEPTH) {
      // Explore only non-excluded folders that we've already seen
      const toExplore = currentLevel.filter(
        (f) => !isExcluded(f) && visited.has(f),
      );

      if (toExplore.length === 0) break;

      // List subdirectories of all folders at this level concurrently
      const childrenPerFolder = await mapConcurrent(
        toExplore,
        (folder) => listSubfoldersPaginated(base, sid, folder).catch(() => [] as string[]),
        SCAN_CONCURRENCY,
      );

      // Gather next level, filtering already-seen and excluded
      const nextLevel: string[] = [];
      for (const children of childrenPerFolder) {
        for (const child of children) {
          if (!visited.has(child) && !isExcluded(child)) {
            visited.add(child);
            nextLevel.push(child);
            allFolders.push(child);
          }
        }
      }

      currentLevel = nextLevel;
      depth++;
    }
  }

  return allFolders;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ server: string }> },
) {
  const { server } = await params;
  try {
    const filePath = getConfigPath(server);
    const raw = await fs.readFile(filePath, "utf-8");
    const config = yaml.load(raw) as Record<string, unknown>;
    const perms = config.permissions as Record<string, unknown>;
    const existing = (perms?.paths || []) as Array<{
      path: string;
      access: string;
      description?: string;
    }>;

    let discovered: string[] = [];
    if (server === "synology-nas") {
      discovered = await scanSynology();
    } else {
      return NextResponse.json({
        scanned: true,
        discovered: 0,
        added: 0,
        total: existing.length,
        message: "Auto-discovery not available for this server yet",
      });
    }

    const existingPaths = new Set(
      existing.map((r) => r.path.replace(/\/\*\*$/, "")),
    );
    let added = 0;
    for (const folderPath of discovered) {
      if (isExcluded(folderPath)) continue;
      const normalized = folderPath.replace(/\/$/, "");
      if (!existingPaths.has(normalized)) {
        existing.push({
          path: `${normalized}/**`,
          access: "read",
          description: "Auto-discovered",
        });
        existingPaths.add(normalized);
        added++;
      }
    }

    // Remove paths matching current exclude patterns
    const cleaned = existing.filter((r) => {
      const segments = r.path.replace(/\/\*\*$/, "").split("/").filter(Boolean);
      return !segments.some((seg) => isExcluded(`/${seg}`));
    });
    const removed = existing.length - cleaned.length;
    if (removed > 0) (perms as Record<string, unknown>).paths = cleaned;

    if (added > 0 || removed > 0) {
      const yamlStr = yaml.dump(config, { noRefs: true, lineWidth: -1 });
      await fs.writeFile(filePath, yamlStr, "utf-8");
    }

    return NextResponse.json({
      scanned: true,
      discovered: discovered.length,
      added,
      removed,
      total: cleaned.length,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
