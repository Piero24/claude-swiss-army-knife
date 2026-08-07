/** POST scan — trigger folder discovery inside the MCP container via Docker socket.
 *
 *  Uses the Docker socket API with a detached exec + logs approach that works
 *  reliably on macOS, Linux, and Windows (avoids the stream upgrade hang).
 */

import { NextResponse } from "next/server";
import http from "http";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { getConfigPath, getAllUserConfigPaths } from "@/lib/config";
import { endScan, isCancelled, startScan } from "@/lib/scan-status";
import { getScanTimeoutSeconds, isExcluded } from "@/lib/scan-constants";

// ── Server → container → discover command mapping ──────────────────────

const SCAN_CONFIG: Record<string, { container: string; cmd: string[] }> = {
  "synology-nas": {
    container: "synology-mcp",
    cmd: ["python", "-m", "synology_mcp", "discover"],
  },
  obsidian: {
    container: "obsidian-mcp",
    cmd: ["python", "-m", "obsidian_mcp", "discover"],
  },
  "ubuntu-server": {
    container: "ubuntu-mcp",
    cmd: ["python", "-m", "ubuntu_mcp", "discover"],
  },
};

// ── Docker socket helpers ───────────────────────────────────────────────

function dockerRequest<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      socketPath: "/var/run/docker.sock",
      path,
      method,
      headers:
        body !== undefined
          ? { "Content-Type": "application/json" }
          : undefined,
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error(data.slice(0, 200))); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error("timeout")); });
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

/** Run a command in a container via detached exec + logs (no stream hang). */
async function dockerExec(
  container: string,
  cmd: string[],
  timeoutMs: number = -1,
  signal?: AbortSignal,
): Promise<string> {
  // Create exec instance
  const create = await dockerRequest<{ Id: string }>(
    "POST",
    `/containers/${container}/exec`,
    { AttachStdout: true, AttachStderr: true, Cmd: cmd },
  );

  // Start exec and capture output via logs (avoids stream upgrade hang)
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];

    const onAbort = () => reject(new Error("Scan cancelled by user"));

    // Start the exec
    const startReq = http.request(
      {
        socketPath: "/var/run/docker.sock",
        path: `/exec/${create.Id}/start`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        res.on("data", (c: Buffer) => parts.push(c));
        res.on("end", () => {
          signal?.removeEventListener("abort", onAbort);
          // Docker multiplexes: 8-byte header per frame (type + 3 zero + 4 len)
          const raw = Buffer.concat(parts);
          let stdout = "";
          let pos = 0;
          while (pos + 8 <= raw.length) {
            const streamType = raw[pos];
            const frameLen = raw.readUInt32BE(pos + 4);
            pos += 8;
            if (pos + frameLen > raw.length) break;
            if (streamType === 1) { // stdout
              stdout += raw.subarray(pos, pos + frameLen).toString("utf-8");
            }
            pos += frameLen;
          }
          resolve(stdout.trim());
        });
      },
    );
    startReq.on("error", reject);

    // Wire abort signal
    if (signal) {
      if (signal.aborted) { reject(new Error("Scan cancelled by user")); return; }
      signal.addEventListener("abort", onAbort, { once: true });
      signal.addEventListener("abort", () => startReq.destroy(), { once: true });
    }

    if (timeoutMs > 0) {
      startReq.setTimeout(timeoutMs, () => {
        startReq.destroy();
        reject(new Error(`Scan timed out after ${timeoutMs / 1000}s`));
      });
    }
    startReq.write(JSON.stringify({ Detach: false, Tty: false }));
    startReq.end();
  });
}

// ── POST handler ────────────────────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ server: string }> },
) {
  const { server } = await params;
  const userId = new URL(request.url).searchParams.get("user") || undefined;
  const scanCfg = SCAN_CONFIG[server];

  if (!scanCfg) {
    return NextResponse.json(
      { error: "Auto-discovery not available for this server" },
      { status: 400 },
    );
  }

  try {
    const targetFilePaths = userId
      ? [getConfigPath(server, userId)]
      : await getAllUserConfigPaths(server);

    // Run discovery inside the MCP container ONCE
    startScan(server);
    const timeoutSec = getScanTimeoutSeconds();
    const timeoutMs = timeoutSec > 0 ? timeoutSec * 1000 : -1;

    // Wire up cancel support via AbortController
    const abortController = new AbortController();
    const cancelPoll = setInterval(() => {
      if (isCancelled(server)) abortController.abort();
    }, 500);

    let stdout: string;
    try {
      stdout = await dockerExec(
        scanCfg.container,
        scanCfg.cmd,
        timeoutMs,
        abortController.signal,
      );
    } catch (execErr) {
      clearInterval(cancelPoll);
      endScan(server);
      const msg = String(execErr);
      if (msg.includes("cancelled") || msg.includes("Cancelled")) {
        return NextResponse.json(
          { scanned: true, discovered: 0, added: 0, removed: 0, total: 0,
            message: "Scan cancelled by user" },
        );
      }
      return NextResponse.json(
        { error: `Discovery exec failed: ${msg}` },
        { status: 500 },
      );
    }
    clearInterval(cancelPoll);
    endScan(server);

    // Parse the output — could be a JSON array or an error object
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout.trim() || "[]");
    } catch {
      return NextResponse.json(
        { error: `Discovery returned invalid JSON: ${stdout.slice(0, 200)}` },
        { status: 500 },
      );
    }

    // Check if the discover script returned an error object (e.g. {"error": "..."})
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const errObj = parsed as Record<string, unknown>;
      if (errObj.error) {
        return NextResponse.json({
          scanned: false,
          discovered: 0,
          added: 0,
          total: 0,
          error: `Discovery failed: ${errObj.error}`,
        }, { status: 500 });
      }
      return NextResponse.json(
        { error: `Unexpected output from discover: ${stdout.slice(0, 200)}` },
        { status: 500 },
      );
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: `Unexpected output type from discover: ${stdout.slice(0, 200)}` },
        { status: 500 },
      );
    }

    const discovered: string[] = parsed;
    const cancelled = discovered.includes("__CANCELLED__");
    const folders = discovered.filter(
      (f: string) => f !== "__CANCELLED__",
    );

    if (folders.length === 0) {
      return NextResponse.json({
        scanned: true,
        discovered: 0,
        added: 0,
        removed: 0,
        total: 0,
        message: "No folders found — check connection or vault path.",
      });
    }

    let lastAddedCount = 0;
    let lastTotalCount = 0;

    // Apply discovered folders to all targeted user configs
    for (const filePath of targetFilePaths) {
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        const config = yaml.load(raw) as Record<string, unknown>;
        const perms = (config.permissions || {}) as Record<string, unknown>;
        const existing = (perms.paths || []) as Array<{
          path: string;
          access: string;
          description?: string;
        }>;

        const preservedCommands = perms.commands;
        const preservedCommandDefault = perms.default_command_access;
        const preservedTools = perms.tools;
        const preservedToolDefault = perms.default_tool_access;

        const existingAccess: Record<string, string> = {};
        for (const p of existing) {
          if (p.path) existingAccess[p.path] = p.access;
        }

        const newPaths: Array<Record<string, unknown>> = [];
        const seen = new Set<string>();
        for (const folder of folders) {
          if (seen.has(folder)) continue;
          seen.add(folder);
          const name = folder.split("/").filter(Boolean).pop() || folder;
          if (isExcluded(name)) continue;
          const access = existingAccess[folder] || "read";
          newPaths.push({
            id: `path_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            path: folder,
            access,
            description: access !== "read"
              ? `Auto-discovered folder: ${name} (access: ${access})`
              : `Auto-discovered folder: ${name}`,
          });
        }
        perms.paths = newPaths;
        if (preservedCommands !== undefined) { perms.commands = preservedCommands; }
        if (preservedCommandDefault !== undefined) { perms.default_command_access = preservedCommandDefault; }
        if (preservedTools !== undefined) { perms.tools = preservedTools; }
        if (preservedToolDefault !== undefined) { perms.default_tool_access = preservedToolDefault; }

        config.permissions = perms;
        await fs.writeFile(filePath, yaml.dump(config, { noRefs: true, lineWidth: -1 }), "utf-8");
        lastAddedCount = newPaths.length;
        lastTotalCount = newPaths.length;
      } catch { /* file error skip */ }
    }

    return NextResponse.json({
      scanned: true,
      discovered: folders.length,
      added: lastAddedCount,
      removed: 0,
      total: lastTotalCount,
      ...(cancelled ? { message: "Scan was cancelled before completing" } : {}),
    });
  } catch (err) {
    endScan(server);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
