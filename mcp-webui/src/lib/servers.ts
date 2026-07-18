/** Shared server discovery — reads from /api/settings which includes the servers list. */

export interface ServerMeta {
  name: string;
  label: string;
  icon: string;
}

let _cache: ServerMeta[] | null = null;

export async function getServers(): Promise<ServerMeta[]> {
  if (_cache) return _cache;
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) return [];
    const data = await res.json();
    _cache = (data.serverList || []) as ServerMeta[];
  } catch {
    return [];
  }
  return _cache || [];
}

export function clearServerCache() {
  _cache = null;
}
