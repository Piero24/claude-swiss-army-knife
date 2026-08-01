/** POST scan — trigger folder discovery inside the MCP container via Docker socket.
 *
 *  Uses the Docker socket API with a detached exec + logs approach that works
 *  reliably on macOS, Linux, and Windows (avoids the stream upgrade hang).
 */

import { NextResponse } from "next/server";
import http from "http";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { getConfigPath } from "@/lib/config";
import { endScan, startScan } from "@/lib/scan-status";
import { isExcluded } from "@/lib/scan-constants";

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
    cmd: ["python", "-m", "ubuntu_mcp", "discover", "--config", "/app/configs/ubuntu-server.yaml"],
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
async function dockerExec(container: string, cmd: string[]): Promise<string> {
  // Create exec instance
  const create = await dockerRequest<{ Id: string }>(
    "POST",
    `/containers/${container}/exec`,
    { AttachStdout: true, AttachStderr: true, Cmd: cmd },
  );

  // Start exec and capture output via logs (avoids stream upgrade hang)
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];

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
    startReq.setTimeout(120_000, () => { startReq.destroy(); reject(new Error("timeout")); });
    startReq.write(JSON.stringify({ Detach: false, Tty: false }));
    startReq.end();
  });
}

// ── POST handler ────────────────────────────────────────────────────────

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ server: string }> },
) {
  const { server } = await params;
  const scanCfg = SCAN_CONFIG[server];

  if (!scanCfg) {
    return NextResponse.json(
      { error: "Auto-discovery not available for this server" },
      { status: 400 },
    );
  }

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

    // Run discovery inside the MCP container
    startScan(server);
    let stdout: string;
    try {
      stdout = await Promise.race([
        dockerExec(scanCfg.container, scanCfg.cmd),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("Scan timed out after 60s")), 60_000)
        ),
      ]);
    } catch (execErr) {
      endScan();
      return NextResponse.json(
        { error: `Discovery exec failed: ${String(execErr)}` },
        { status: 500 },
      );
    }
    endScan();

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
          total: existing.length,
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

    // Remove cancelled sentinel
    const cancelled = discovered.includes("__CANCELLED__");
    const folders = discovered.filter(
      (f: string) => f !== "__CANCELLED__",
    );

    // If scan found nothing, return 0 without modifying the config
    if (folders.length === 0) {
      return NextResponse.json({
        scanned: true,
        discovered: 0,
        added: 0,
        removed: 0,
        total: existing.length,
        message: "No folders found — check connection or vault path.",
      });
    }

    // Replace ALL existing paths with freshly discovered ones.
    // This ensures old template/fake paths are wiped on every scan.
    const newPaths: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    for (const folder of folders) {
      if (seen.has(folder)) continue;
      seen.add(folder);
      const name = folder.split("/").filter(Boolean).pop() || folder;
      if (isExcluded(name)) continue;
      newPaths.push({
        id: `path_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        path: folder,
        access: "read",
        description: `Auto-discovered folder: ${name}`,
      });
    }
    (perms as Record<string, unknown>).paths = newPaths;

    await fs.writeFile(filePath, yaml.dump(config, { noRefs: true, lineWidth: -1 }), "utf-8");

    return NextResponse.json({
      scanned: true,
      discovered: folders.length,
      added: newPaths.length,
      removed: existing.length,
      total: newPaths.length,
      ...(cancelled ? { message: "Scan was cancelled before completing" } : {}),
    });
  } catch (err) {
    endScan();
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
