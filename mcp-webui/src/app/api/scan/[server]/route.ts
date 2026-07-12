/** POST scan — discover new folders and merge with YAML config. */

import { NextResponse } from "next/server";
import https from "https";
import http from "http";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { getConfigPath } from "@/lib/config";

const EXCLUDE_PATTERNS = [
  ".venv", "venv", "__pycache__", ".git", "node_modules",
  ".next", ".DS_Store", ".pytest_cache", ".mypy_cache",
  "lost+found", ".Trash",
];

function isExcluded(path: string): boolean {
  const name = path.split("/").filter(Boolean).pop() || path;
  return EXCLUDE_PATTERNS.some((p) => name === p);
}

function dockerRequest(path: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: "/var/run/docker.sock", path, method: "GET" },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => { try { resolve(JSON.parse(data)); } catch { reject(new Error(data.slice(0, 200))); } });
      }
    );
    req.on("error", reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

async function getContainerEnv(container: string): Promise<Map<string, string>> {
  const info = await dockerRequest(`/containers/${container}/json`);
  const cfg = info.Config as { Env?: string[] } | undefined;
  const map = new Map<string, string>();
  for (const e of cfg?.Env || []) {
    const eq = e.indexOf("=");
    if (eq > 0) map.set(e.slice(0, eq), e.slice(eq + 1));
  }
  return map;
}

function dsmGet(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const opts: https.RequestOptions = {
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: "GET", rejectUnauthorized: false,
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { reject(new Error(data.slice(0, 200))); } });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

async function scanSynology(): Promise<string[]> {
  const env = await getContainerEnv("synology-mcp");
  const host = env.get("SYNOLOGY_NAS_HOST") || "";
  const port = env.get("SYNOLOGY_NAS_PORT") || "5001";
  const user = env.get("SYNOLOGY_NAS_USER") || "";
  const pass = env.get("SYNOLOGY_NAS_PASSWORD") || "";
  const base = `https://${host}:${port}`;

  const loginResp = await dsmGet(`${base}/webapi/auth.cgi`, {
    api: "SYNO.API.Auth", version: "7", method: "login",
    account: user, passwd: pass, session: "FileStation", format: "cookie",
  });

  if (!(loginResp as { success?: boolean }).success) {
    const err = (loginResp as { error?: unknown }).error;
    throw new Error(`DSM login failed: ${JSON.stringify(err)}. If OTP is enabled, run scan from Claude Code instead.`);
  }

  const sid = (loginResp as { data: { sid: string } }).data.sid;
  const listResp = await dsmGet(`${base}/webapi/entry.cgi`, {
    api: "SYNO.FileStation.List", version: "2", method: "list_share", _sid: sid,
  });

  if (!(listResp as { success?: boolean }).success) {
    throw new Error(`list_share failed: ${JSON.stringify((listResp as { error?: unknown }).error)}`);
  }

  return ((listResp as { data: { shares: Array<{ name: string }> } }).data.shares || []).map((s) => `/${s.name}`);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ server: string }> }
) {
  const { server } = await params;
  try {
    const filePath = getConfigPath(server);
    const raw = await fs.readFile(filePath, "utf-8");
    const config = yaml.load(raw) as Record<string, unknown>;
    const perms = config.permissions as Record<string, unknown>;
    const existing = (perms?.paths || []) as Array<{ path: string; access: string; description?: string }>;

    let discovered: string[] = [];
    if (server === "synology-nas") {
      discovered = await scanSynology();
    } else {
      return NextResponse.json({
        scanned: true, discovered: 0, added: 0, total: existing.length,
        message: "Auto-discovery not available for this server yet",
      });
    }

    const existingPaths = new Set(existing.map((r) => r.path.replace(/\/\*\*$/, "")));
    let added = 0;
    for (const folderPath of discovered) {
      if (isExcluded(folderPath)) continue;
      const normalized = folderPath.replace(/\/$/, "");
      if (!existingPaths.has(normalized)) {
        existing.push({ path: `${normalized}/**`, access: "read", description: "Auto-discovered" });
        existingPaths.add(normalized);
        added++;
      }
    }

    if (added > 0) {
      const yamlStr = yaml.dump(config, { noRefs: true, lineWidth: -1 });
      await fs.writeFile(filePath, yamlStr, "utf-8");
    }

    return NextResponse.json({ scanned: true, discovered: discovered.length, added, total: existing.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
