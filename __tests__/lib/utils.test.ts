import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("should merge basic class names", () => {
    expect(cn("cls1", "cls2")).toBe("cls1 cls2");
  });

  it("should handle conditional classes", () => {
    expect(cn("base", true && "active", false && "hidden")).toBe("base active");
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });

  it("should handle null and undefined", () => {
    expect(cn("base", null, undefined, "extra")).toBe("base extra");
  });

  it("should resolve Tailwind CSS conflicts", () => {
    // tailwind-merge should prefer the last one
    expect(cn("px-2 py-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("should handle arrays of classes", () => {
    expect(cn(["cls1", "cls2"], "cls3")).toBe("cls1 cls2 cls3");
  });

  it("should return an empty string for no inputs", () => {
    expect(cn()).toBe("");
  });
});
