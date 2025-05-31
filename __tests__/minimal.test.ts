import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock process first
vi.mock("process", () => ({
  cwd: vi.fn(() => "/test/workspace")
}));

// Mock path module
vi.mock("path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("path")>();
  return {
    default: actual,
    ...actual,
    join: vi.fn((...args: string[]) => {
      console.log("PATH JOIN CALLED WITH:", args);
      const validArgs = args.filter(arg => arg != null && arg !== '');
      const result = validArgs.length > 0 ? validArgs.join("/") : "/fallback";
      console.log("PATH JOIN RESULT:", result);
      return result;
    })
  };
});

// Mock fs
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    default: actual,
    ...actual,
    promises: {
      mkdir: vi.fn().mockResolvedValue(undefined)
    }
  };
});

// Mock logger
vi.mock("../src/lib/services/logging", () => ({
  logger: {
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
    debug: vi.fn().mockResolvedValue(undefined)
  }
}));

describe("Minimal Path Test", () => {
  it("should test process.cwd() and path.join()", async () => {
    const path = await import("path");
    
    console.log("Testing process.cwd()");
    const cwd = process.cwd();
    console.log("process.cwd() result:", cwd);
    
    console.log("Testing path.join with process.cwd()");
    const joined = path.join(cwd, "src", "lib", "data");
    console.log("path.join result:", joined);
    
    expect(cwd).toBeDefined();
    expect(joined).toBeDefined();
    expect(joined).not.toBe("");
  });
});
