/** GET folder tree for any MCP server — built from YAML path rules. */

import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as yaml from "js-yaml";
import { getConfigPath } from "@/lib/config";

import { isExcluded } from "@/lib/scan-constants";

interface FolderNode {
  name: string;
  path: string;
  access: string;
  description: string;
  children: FolderNode[];
}

function buildTree(paths: Array<{ path: string; access: string; description?: string }>): FolderNode[] {
  const root: Record<string, FolderNode> = {};

  for (const rule of paths) {
    const clean = rule.path.replace(/^\/+/, "").replace(/\/\*\*$/, "");
    const segments = clean.split("/");

    if (segments.length === 0 || segments[0] === "") continue;
    if (isExcluded(segments[0])) continue;

    const topName = segments[0];
    if (!root[topName]) {
      root[topName] = {
        name: topName,
        path: `/${topName}/**`,
        access: rule.access,
        description: rule.description || "",
        children: [],
      };
    }

    // Build sub-tree for nested paths
    if (segments.length > 1) {
      let current = root[topName];
      let currentPath = `/${topName}`;
      for (let i = 1; i < segments.length; i++) {
        currentPath += `/${segments[i]}`;
        let child = current.children.find((c) => c.name === segments[i]);
        if (!child) {
          child = {
            name: segments[i],
            path: `${currentPath}/**`,
            access: rule.access,
            description: "",
            children: [],
          };
          current.children.push(child);
        }
        current = child;
      }
      // Update leaf with rule's access if it's more specific
      current.access = rule.access;
      if (rule.description) current.description = rule.description;
    }
  }

  return Object.values(root).sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ server: string }> }
) {
  const { server } = await params;
  try {
    const filePath = getConfigPath(server);
    const raw = await fs.readFile(filePath, "utf-8");
    const config = yaml.load(raw) as Record<string, unknown>;
    const perms = config.permissions as Record<string, unknown>;
    const paths = (perms?.paths || []) as Array<{ path: string; access: string; description?: string }>;

    const tree = buildTree(paths);
    return NextResponse.json({ server, folders: tree, count: paths.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
