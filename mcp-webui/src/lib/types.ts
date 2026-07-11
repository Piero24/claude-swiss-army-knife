/** Permission engine types — mirrors Python Pydantic models. */

export type AccessLevel = "none" | "read" | "write";

export interface PathRule {
  id: string;
  path: string;
  access: AccessLevel;
  description?: string;
}

export interface CommandRule {
  id: string;
  pattern: string;
  access: AccessLevel;
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
    default_command_access: AccessLevel;
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
}

export type ServerName = "ubuntu-server" | "obsidian" | "synology-nas";

export const SERVER_LABELS: Record<ServerName, string> = {
  "ubuntu-server": "Ubuntu Server",
  "obsidian": "Obsidian",
  "synology-nas": "Synology NAS",
};

export const SERVER_ICONS: Record<ServerName, string> = {
  "ubuntu-server": "🖥",
  "obsidian": "📝",
  "synology-nas": "💾",
};

export const ACCESS_COLORS: Record<AccessLevel, string> = {
  none: "bg-gray-200 text-gray-700 border-gray-400",
  read: "bg-blue-100 text-blue-700 border-blue-400",
  write: "bg-green-100 text-green-700 border-green-400",
};
