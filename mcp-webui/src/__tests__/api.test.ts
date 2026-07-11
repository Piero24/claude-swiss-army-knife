import { describe, it, expect } from "vitest";
import {
  SERVER_LABELS,
  SERVER_ICONS,
  ACCESS_COLORS,
  type ServerName,
  type AccessLevel,
} from "@/lib/types";

describe("types", () => {
  describe("SERVER_LABELS", () => {
    it("has labels for all three servers", () => {
      expect(SERVER_LABELS["ubuntu-server"]).toBe("Ubuntu Server");
      expect(SERVER_LABELS["obsidian"]).toBe("Obsidian");
      expect(SERVER_LABELS["synology-nas"]).toBe("Synology NAS");
    });

    it("has exactly three entries", () => {
      expect(Object.keys(SERVER_LABELS)).toHaveLength(3);
    });
  });

  describe("SERVER_ICONS", () => {
    it("has icons for all three servers", () => {
      const servers: ServerName[] = [
        "ubuntu-server",
        "obsidian",
        "synology-nas",
      ];
      for (const s of servers) {
        expect(SERVER_ICONS[s]).toBeTruthy();
      }
    });
  });

  describe("ACCESS_COLORS", () => {
    it("has color classes for each access level", () => {
      const levels: AccessLevel[] = ["none", "read", "write"];
      for (const level of levels) {
        expect(ACCESS_COLORS[level]).toBeTruthy();
        expect(ACCESS_COLORS[level]).toContain("bg-");
      }
    });
  });
});

describe("ServerName type", () => {
  it("accepts valid server names", () => {
    const valid: ServerName[] = ["ubuntu-server", "obsidian", "synology-nas"];
    expect(valid).toHaveLength(3);
  });
});
