/** POST scan — discover new folders and merge with YAML config. */

import { NextResponse } from "next/server";
import crypto from "crypto";
import https from "https";
import http from "http";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { getConfigPath } from "@/lib/config";

function totp(secret: string): string {
  const key = base32Decode(secret.toUpperCase().replace(/\s/g, ""));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac("sha1", key).update(counter).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

function base32Decode(s: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const output: number[] = [];
  for (let i = 0; i < s.length; i++) {
    value = (value << 5) | alphabet.indexOf(s[i]);
    bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(output);
}

const EXCLUDE_PATTERNS = [
  ".venv", "venv", "__pycache__", ".git", "node_modules",
  ".next", ".DS_Store", ".pytest_cache", ".mypy_cache",
  "lost+found", ".Trash", "#recycle", "@eaDir",
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

async function listSubfolders(base: string, sid: string, folderPath: string): Promise<string[]> {
  const resp = await dsmGet(`${base}/webapi/entry.cgi`, {
    api: "SYNO.FileStation.List", version: "2", method: "list",
    folder_path: `"${folderPath}"`, filetype: "dir", _sid: sid,
  });
  if (!(resp as { success?: boolean }).success) return [];
  return ((resp as { data: { files?: Array<{ name: string; isdir: boolean }> } }).data.files || [])
    .filter((f) => f.isdir)
    .map((f) => `${folderPath}/${f.name}`);
}

async function scanRecursive(
  base: string, sid: string, folder: string, depth: number, maxDepth: number
): Promise<string[]> {
  if (depth >= maxDepth) return [folder];
  const results: string[] = [folder];
  try {
    const children = await listSubfolders(base, sid, folder);
    for (const child of children) {
      const name = child.split("/").pop() || "";
      if (isExcluded(name)) continue;
      const subResults = await scanRecursive(base, sid, child, depth + 1, maxDepth);
      results.push(...subResults);
    }
  } catch { /* skip inaccessible folders */ }
  return results;
}

async function dsmLogin(base: string, user: string, pass: string, otpSecret: string): Promise<string> {
  const resp = await dsmGet(`${base}/webapi/auth.cgi`, {
    api: "SYNO.API.Auth", version: "7", method: "login",
    account: user, passwd: pass, session: "FileStation", format: "cookie",
  });

  if ((resp as { success?: boolean }).success) {
    return (resp as { data: { sid: string } }).data.sid;
  }

  const err = (resp as { error?: { code?: number } }).error;
  if (err?.code === 403 && otpSecret) {
    const otpResp = await dsmGet(`${base}/webapi/auth.cgi`, {
      api: "SYNO.API.Auth", version: "7", method: "login",
      account: user, passwd: pass, session: "FileStation", format: "cookie",
      otp_code: totp(otpSecret),
    });
    if ((otpResp as { success?: boolean }).success) {
      return (otpResp as { data: { sid: string } }).data.sid;
    }
    throw new Error(`DSM login with OTP failed: ${JSON.stringify((otpResp as { error?: unknown }).error)}`);
  }

  if (err?.code === 403) {
    throw new Error("DSM requires OTP but SYNOLOGY_NAS_OTP_SECRET is not set");
  }
  throw new Error(`DSM login failed: ${JSON.stringify(err)}`);
}

async function scanSynology(): Promise<string[]> {
  const env = await getContainerEnv("synology-mcp");
  const host = env.get("SYNOLOGY_NAS_HOST") || "";
  const port = env.get("SYNOLOGY_NAS_PORT") || "5001";
  const user = env.get("SYNOLOGY_NAS_USER") || "";
  const pass = env.get("SYNOLOGY_NAS_PASSWORD") || "";
  const otpSecret = env.get("SYNOLOGY_NAS_OTP_SECRET") || "";
  const base = `https://${host}:${port}`;

  const sid = await dsmLogin(base, user, pass, otpSecret);

  // Get top-level shared folders
  const shareResp = await dsmGet(`${base}/webapi/entry.cgi`, {
    api: "SYNO.FileStation.List", version: "2", method: "list_share", _sid: sid,
  });
  if (!(shareResp as { success?: boolean }).success) {
    throw new Error(`list_share failed: ${JSON.stringify((shareResp as { error?: unknown }).error)}`);
  }

  const shares = ((shareResp as { data: { shares: Array<{ name: string }> } }).data.shares || [])
    .map((s) => `/${s.name}`);

  // Recursive subfolder scan (full depth, exclusion patterns prevent noise)
  const MAX_DEPTH = 20;
  const allFolders: string[] = [];
  for (const share of shares) {
    if (isExcluded(share)) continue;
    const tree = await scanRecursive(base, sid, share, 1, MAX_DEPTH);
    allFolders.push(...tree);
  }

  return allFolders;
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
