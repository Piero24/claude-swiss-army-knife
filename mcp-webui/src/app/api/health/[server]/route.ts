import { NextResponse } from "next/server";
import http from "http";
import fs from "fs/promises";
import path from "path";
import { ensureScheduler } from "@/instrumentation";

ensureScheduler();

const CONTAINER_MAP: Record<string, string> = {
  "ubuntu-server": process.env.UBUNTU_MCP_CONTAINER || "ubuntu-mcp",
  obsidian: process.env.OBSIDIAN_MCP_CONTAINER || "obsidian-mcp",
  "synology-nas": process.env.SYNOLOGY_MCP_CONTAINER || "synology-mcp",
  "github-mcp": process.env.GITHUB_MCP_CONTAINER || "github-mcp",
};

const LOG_DIRS: Record<string, string> = {
  "ubuntu-server": "ubuntu",
  obsidian: "obsidian",
  "synology-nas": "synology",
  "github-mcp": "github",
};

const LOGS_PATH = process.env.LOGS_PATH || "/var/log/mcp";

const PLACEHOLDER_PATTERNS = [
  /change-me/,
  /your-server\.example/,
  /your-nas-(username|password)/,
  /your-obsidian-image/,
  /192\.168\.1\.100/,
  /your-github-token/,
];

const REQUIRED_ENV: Record<string, string[]> = {
  "synology-nas": ["SYNOLOGY_NAS_HOST", "SYNOLOGY_NAS_USER", "SYNOLOGY_NAS_PASSWORD"],
  "github-mcp": ["GITHUB_PERSONAL_ACCESS_TOKEN"],
};

type HealthStatus = "healthy" | "idle" | "stopped" | "not-found" | "unconfigured" | "error";

function dockerRequest(reqPath: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: "/var/run/docker.sock", path: reqPath, method: "GET" },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); } catch {
            reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error("Docker socket timeout")); });
    req.end();
  });
}

async function getContainerInfo(container: string): Promise<{ status: string; env: string[] }> {
  try {
    const info = await dockerRequest(`/containers/${encodeURIComponent(container)}/json`);
    const state = info.State as { Status?: string } | undefined;
    const config = info.Config as { Env?: string[] } | undefined;
    return { status: state?.Status === "running" ? "running" : "stopped", env: config?.Env || [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no such container") || msg.includes("404")) return { status: "not-found", env: [] };
    return { status: "error", env: [] };
  }
}

function hasPlaceholders(envVars: string[], keys: string[]): string[] {
  const bad: string[] = [];
  const envMap = new Map<string, string>();
  for (const entry of envVars) {
    const eq = entry.indexOf("=");
    if (eq > 0) envMap.set(entry.slice(0, eq), entry.slice(eq + 1));
  }
  for (const key of keys) {
    const val = envMap.get(key) || "";
    if (!val || PLACEHOLDER_PATTERNS.some((p) => p.test(val))) bad.push(key);
  }
  return bad;
}

async function getLastAuditActivity(logDir: string): Promise<Date | null> {
  try {
    const auditFile = path.join(LOGS_PATH, logDir, "audit.log");
    const stat = await fs.stat(auditFile);
    return stat.mtime;
  } catch { return null; }
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ server: string }> }
) {
  const { server } = await params;
  const container = CONTAINER_MAP[server];
  if (!container) {
    return NextResponse.json({ status: "not-found", container: "unknown", lastActivity: null, detail: `Unknown server: ${server}` });
  }

  const [containerInfo, lastActivity] = await Promise.all([
    getContainerInfo(container),
    getLastAuditActivity(LOG_DIRS[server] || server),
  ]);

  let status: HealthStatus;
  let detail: string;

  if (containerInfo.status === "not-found") {
    status = "not-found"; detail = "Container not found";
  } else if (containerInfo.status === "error") {
    status = "error"; detail = "Could not check Docker socket";
  } else if (containerInfo.status !== "running") {
    status = "stopped"; detail = "Container is not running";
  } else {
    const requiredKeys = REQUIRED_ENV[server] || [];
    const badKeys = hasPlaceholders(containerInfo.env, requiredKeys);
    if (badKeys.length > 0) {
      status = "unconfigured";
      detail = `Default credentials detected: ${badKeys.join(", ")}`;
    } else if (lastActivity) {
      const hourAgo = Date.now() - 60 * 60 * 1000;
      if (lastActivity.getTime() > hourAgo) {
        status = "healthy"; detail = `Active — last activity ${timeAgo(lastActivity)}`;
      } else {
        status = "idle"; detail = `No activity since ${lastActivity.toISOString().slice(0, 16)}`;
      }
    } else {
      status = "idle"; detail = "Running but no activity yet";
    }
  }

  return NextResponse.json({ status, container: containerInfo.status, lastActivity: lastActivity?.toISOString() || null, detail });
}
