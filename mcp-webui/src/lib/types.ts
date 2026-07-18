/** Permission engine types — mirrors Python Pydantic models. */

export type AccessLevel = "none" | "read" | "write";
export type CommandAccess = "none" | "active";

export interface PathRule {
  id: string;
  path: string;
  access: AccessLevel;
  description?: string;
}

export interface CommandRule {
  id: string;
  pattern: string;
  access: CommandAccess;
  description?: string;
}

export interface ServerConfig {
  server: {
    name: string;
    log_level: string;
    audit_log: string;
  };
  permissions: {
    default_access: AccessLevel;
    paths: PathRule[];
    commands: CommandRule[];
    default_command_access: CommandAccess;
  };
}

export interface AuditEntry {
  ts: string;
  server: string;
  result: "allowed" | "denied";
  target_type?: string;
  target?: string;
  command?: string;
  access?: string;
  reason?: string;
  user_id?: string;
  subagent_id?: string;
  message?: string;
}

/** Server name is dynamic — discovered from configs directory at runtime. */
export type ServerName = string;

export const ACCESS_COLORS: Record<AccessLevel, string> = {
  none: "bg-gray-200 text-gray-700 border-gray-400",
  read: "bg-blue-100 text-blue-700 border-blue-400",
  write: "bg-green-100 text-green-700 border-green-400",
};

// ── Agents ──────────────────────────────────────────

export interface UserConfig {
  id: string;
  key: string;
  name: string;
  enabled: boolean;
  tools: string[];
}

export interface UsersConfig {
  mode: "open" | "allowlist" | "blocklist";
  users: UserConfig[];
}
