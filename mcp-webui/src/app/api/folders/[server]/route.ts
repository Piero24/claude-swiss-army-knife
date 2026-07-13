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

  // Build a lookup map: normalized path → rule (for access resolution)
  const ruleMap = new Map<string, { access: string; description?: string }>();
  for (const rule of paths) {
    const clean = "/" + rule.path.replace(/^\/+/, "").replace(/\/\*\*$/, "");
    // Most-specific (last) rule for a given path wins
    ruleMap.set(clean, { access: rule.access, description: rule.description });
  }

  // Pass 1: Build the tree structure
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
        access: "none", // placeholder — resolved in pass 2
        description: "",
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
            access: "none", // placeholder — resolved in pass 2
            description: "",
            children: [],
          };
          current.children.push(child);
        }
        current = child;
      }
    }
  }

  // Pass 2: Resolve each node's access from the rule map
  function resolveAccess(node: FolderNode): void {
    const nodePath = "/" + node.path.replace(/^\/+/, "").replace(/\/\*\*$/, "");
    const rule = ruleMap.get(nodePath);
    if (rule) {
      node.access = rule.access;
      if (rule.description) node.description = rule.description;
    }
    for (const child of node.children) {
      resolveAccess(child);
    }
  }

  const result = Object.values(root);
  for (const node of result) {
    resolveAccess(node);
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
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
