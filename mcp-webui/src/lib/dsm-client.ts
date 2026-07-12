/** DSM API client — typed HTTP helpers for Synology NAS communication.
 *  Extracted from the scan route so it can be reused and tested independently.
 *
 *  Features:
 *  - Typed dsmGet<T> with pagination-aware listSubfolders
 *  - Exponential-backoff retry on transient failures (5xx / timeout)
 *  - OTP-aware login
 *  - Shared-folder enumeration */

import crypto from "crypto";
import https from "https";

// ---------------------------------------------------------------------------
// TOTP helpers (unchanged from original scan route)
// ---------------------------------------------------------------------------

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
  let bits = 0,
    value = 0;
  const output: number[] = [];
  for (let i = 0; i < s.length; i++) {
    value = (value << 5) | alphabet.indexOf(s[i]);
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DSMResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code?: number; message?: string };
}

export interface DSMFile {
  name: string;
  isdir: boolean;
}

export interface DSMListData {
  files: DSMFile[];
  total?: number;
  offset?: number;
}

export interface DSMShareData {
  shares: Array<{ name: string }>;
}

export interface DSMLoginData {
  sid: string;
}

// ---------------------------------------------------------------------------
// Low-level HTTP
// ---------------------------------------------------------------------------

const DSM_TIMEOUT_MS = 30_000;

export function dsmGet<T = unknown>(
  url: string,
  params: Record<string, string>,
  timeoutMs = DSM_TIMEOUT_MS,
): Promise<DSMResponse<T>> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const opts: https.RequestOptions = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: "GET",
      rejectUnauthorized: false,
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data) as DSMResponse<T>);
        } catch {
          reject(new Error(data.slice(0, 200)));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("DSM request timeout"));
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

const DSM_RETRIES = 2;
const DSM_RETRY_BASE_MS = 1_000;

/**
 * Call dsmGet with exponential-backoff retry on server errors (5xx) and
 * network timeouts.  Client errors (4xx) are not retried.
 */
export async function dsmGetWithRetry<T = unknown>(
  url: string,
  params: Record<string, string>,
  retries = DSM_RETRIES,
  baseDelayMs = DSM_RETRY_BASE_MS,
  timeoutMs = DSM_TIMEOUT_MS,
): Promise<DSMResponse<T>> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await dsmGet<T>(url, params, timeoutMs);
      if (resp.success) return resp;

      // Retry on server errors (5xx) only
      const code = resp.error?.code;
      if (code !== undefined && code >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
        continue;
      }
      return resp; // client error — don't retry
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("dsmGetWithRetry: exhausted retries");
}

// ---------------------------------------------------------------------------
// DSM login (OTP-aware)
// ---------------------------------------------------------------------------

export async function dsmLogin(
  base: string,
  user: string,
  pass: string,
  otpSecret: string,
): Promise<string> {
  const resp = await dsmGet<DSMLoginData>(`${base}/webapi/auth.cgi`, {
    api: "SYNO.API.Auth",
    version: "7",
    method: "login",
    account: user,
    passwd: pass,
    session: "FileStation",
    format: "cookie",
  });

  if (resp.success) {
    return resp.data!.sid;
  }

  const err = resp.error;
  if (err?.code === 403 && otpSecret) {
    const otpResp = await dsmGet<DSMLoginData>(`${base}/webapi/auth.cgi`, {
      api: "SYNO.API.Auth",
      version: "7",
      method: "login",
      account: user,
      passwd: pass,
      session: "FileStation",
      format: "cookie",
      otp_code: totp(otpSecret),
    });
    if (otpResp.success) {
      return otpResp.data!.sid;
    }
    throw new Error(
      `DSM login with OTP failed: ${JSON.stringify(otpResp.error)}`,
    );
  }

  if (err?.code === 403) {
    throw new Error("DSM requires OTP but SYNOLOGY_NAS_OTP_SECRET is not set");
  }
  throw new Error(`DSM login failed: ${JSON.stringify(err)}`);
}

// ---------------------------------------------------------------------------
// Paginated folder listing
// ---------------------------------------------------------------------------

/**
 * List ALL subdirectories of a folder, following DSM pagination.
 * Loops until all pages are consumed (offset >= total).
 */
export async function listSubfoldersPaginated(
  base: string,
  sid: string,
  folderPath: string,
): Promise<string[]> {
  const all: string[] = [];
  let offset = 0;
  const limit = 100; // DSM default max per page

  while (true) {
    const resp = await dsmGetWithRetry<DSMListData>(
      `${base}/webapi/entry.cgi`,
      {
        api: "SYNO.FileStation.List",
        version: "2",
        method: "list",
        folder_path: `"${folderPath}"`,
        filetype: "dir",
        _sid: sid,
        offset: String(offset),
        limit: String(limit),
      },
    );

    if (!resp.success) break;

    const files = resp.data?.files || [];
    for (const f of files) {
      if (f.isdir) all.push(`${folderPath}/${f.name}`);
    }

    const total = resp.data?.total ?? 0;
    offset += limit;
    if (offset >= total) break;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Shared-folder enumeration
// ---------------------------------------------------------------------------

/** List top-level shared folders on the NAS. */
export async function listShares(
  base: string,
  sid: string,
): Promise<string[]> {
  const resp = await dsmGetWithRetry<DSMShareData>(
    `${base}/webapi/entry.cgi`,
    {
      api: "SYNO.FileStation.List",
      version: "2",
      method: "list_share",
      _sid: sid,
    },
  );
  if (!resp.success) {
    throw new Error(
      `list_share failed: ${JSON.stringify(resp.error)}`,
    );
  }
  return (resp.data?.shares || []).map((s) => `/${s.name}`);
}
