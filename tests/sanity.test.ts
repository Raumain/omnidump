import { describe, expect, it } from "bun:test";

describe("OmniDump Sanity Check", () => {
  it("should pass this basic math test to verify the bun test runner", () => {
    expect(1 + 1).toBe(2);
  });

  it("should verify that Bun is available in the environment", () => {
    expect(typeof Bun).toBe("object");
  });
});
