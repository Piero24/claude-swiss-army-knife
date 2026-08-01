/** Shared server name constants — safe to import in both client and server components. */

// Friendly display labels for canonical server keys.
const SERVER_LABELS: Record<string, string> = {
  "ubuntu-server": "Ubuntu Server",
  "obsidian": "Obsidian",
  "synology-nas": "Synology NAS",
  "github-mcp": "GitHub",
};

/** Normalize a raw server name to its canonical form. Since server.name YAML
 *  values and docker log mounts all use the canonical name, this is identity. */
export function normalizeServer(raw: string): string {
  return raw;
}

/** Human-readable label for a canonical server key. */
export function serverLabel(canonicalKey: string): string {
  return SERVER_LABELS[canonicalKey] || canonicalKey;
}
