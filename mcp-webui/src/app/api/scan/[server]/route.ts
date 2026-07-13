/** POST scan — trigger folder discovery inside the MCP container via docker exec.
 *
 *  Each MCP server has a `discover` module that lists folders from its native
 *  backend and prints JSON to stdout.  The web UI never sees credentials —
 *  they stay inside the container where they belong.
 *
 *  Server → container → discover command:
 *    synology-nas  → synology-mcp  → python -m synology_mcp discover
 *    obsidian      → obsidian-mcp  → python -m obsidian_mcp discover
 *    ubuntu-server → ubuntu-mcp    → python -m ubuntu_mcp discover */

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
    cmd: ["python", "-m", "ubuntu_mcp", "discover"],
  },
};

// ── Docker exec via socket ──────────────────────────────────────────────

function dockerRequest(
  method: string,
  p: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      socketPath: "/var/run/docker.sock",
      path: p,
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
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(data.slice(0, 200)));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(30_000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

/** Run a command inside a Docker container and return stdout as a string. */
async function dockerExec(
  container: string,
  cmd: string[],
): Promise<string> {
  // 1. Create exec instance
  const create = (await dockerRequest("POST", `/containers/${container}/exec`, {
    AttachStdout: true,
    AttachStderr: true,
    Cmd: cmd,
  })) as unknown as { Id: string };

  // 2. Start and capture output
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    const req = http.request(
      {
        socketPath: "/var/run/docker.sock",
        path: `/exec/${create.Id}/start`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Connection: "Upgrade",
          Upgrade: "tcp",
        },
      },
      (res) => {
        res.on("data", (c: Buffer) => parts.push(c));
        res.on("end", () => {
          // Docker multiplexes stdout/stderr — strip 8-byte header per frame
          const raw = Buffer.concat(parts);
          let stdout = "";
          let pos = 0;
          while (pos + 8 <= raw.length) {
            const streamType = raw[pos];
            const frameLen = raw.readUInt32BE(pos + 4);
            pos += 8;
            if (pos + frameLen > raw.length) break;
            if (streamType === 1) {
              // stdout
              stdout += raw.subarray(pos, pos + frameLen).toString("utf-8");
            }
            pos += frameLen;
          }
          resolve(stdout.trim());
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(120_000, () => {
      req.destroy();
      reject(new Error("exec timeout"));
    });
    req.write(
      JSON.stringify({ Detach: false, Tty: false }),
    );
    req.end();
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
    const stdout = await dockerExec(scanCfg.container, scanCfg.cmd);
    endScan();

    let discovered: string[];
    try {
      const parsed = JSON.parse(stdout);
      if (Array.isArray(parsed)) {
        discovered = parsed;
      } else if (parsed && typeof parsed === "object" && "error" in parsed) {
        return NextResponse.json(
          { error: parsed.error },
          { status: 500 },
        );
      } else {
        discovered = [];
      }
    } catch {
      return NextResponse.json(
        { error: `Invalid JSON from discover: ${stdout.slice(0, 200)}` },
        { status: 500 },
      );
    }

    if (discovered.includes("__CANCELLED__")) {
      return NextResponse.json({ cancelled: true });
    }

    // Merge discovered folders into YAML config (same logic, no secrets)
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
      const segments = r.path
        .replace(/\/\*\*$/, "")
        .split("/")
        .filter(Boolean);
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
    endScan();
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
