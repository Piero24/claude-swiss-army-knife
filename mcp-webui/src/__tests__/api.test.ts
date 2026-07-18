import { describe, it, expect } from "vitest";
import {
  ACCESS_COLORS,
  type AccessLevel,
} from "@/lib/types";

describe("types", () => {
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
