/** Shared server name constants — safe to import in both client and server components. */

// Friendly display labels for canonical server keys.
export const SERVER_LABELS: Record<string, string> = {
  "ubuntu-server": "Ubuntu Server",
  "obsidian": "Obsidian",
  "synology-nas": "Synology NAS",
  "github-mcp": "GitHub",
};

// Map every known variant (log dir name, short name, canonical) to canonical.
const NAME_TO_CANONICAL: Record<string, string> = {
  "ubuntu-server": "ubuntu-server",
  "ubuntu-mcp": "ubuntu-server",
  "ubuntu": "ubuntu-server",
  "obsidian": "obsidian",
  "obsidian-mcp": "obsidian",
  "synology-nas": "synology-nas",
  "synology-mcp": "synology-nas",
  "synology": "synology-nas",
  "github-mcp": "github-mcp",
  "github": "github-mcp",
};

/** Normalize a raw server name to its canonical form. */
export function normalizeServer(raw: string): string {
  return NAME_TO_CANONICAL[raw] || raw;
}

/** Human-readable label for a canonical server key. */
export function serverLabel(canonicalKey: string): string {
  return SERVER_LABELS[canonicalKey] || canonicalKey;
}
