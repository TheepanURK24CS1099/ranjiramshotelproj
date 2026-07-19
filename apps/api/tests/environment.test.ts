import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../src/config/environment.js";

describe("environment parsing", () => {
  it.each([
    ["true", true],
    ["TRUE", true],
    ["1", true],
    ["yes", true],
    ["on", true],
    ["false", false],
    ["FALSE", false],
    ["0", false],
    ["no", false],
    ["off", false],
  ])("parses TRUST_PROXY=%s as %s", (value, expected) => {
    expect(parseEnvironment({ TRUST_PROXY: value }).TRUST_PROXY).toBe(expected);
  });

  it.each(["enabled", "disabled", "2", 1])("rejects invalid TRUST_PROXY=%j", (value) => {
    expect(() => parseEnvironment({ TRUST_PROXY: value })).toThrow();
  });

  it.each([3022, "3022"])("accepts API_PORT=%j as an integer", (value) => {
    const port = parseEnvironment({ API_PORT: value }).API_PORT;

    expect(port).toBe(3022);
    expect(Number.isInteger(port)).toBe(true);
  });

  it.each([0, 65_536, 70_000, -1, 3.5, "abc", ""])("rejects API_PORT=%j", (value) => {
    expect(() => parseEnvironment({ API_PORT: value })).toThrow();
  });

  it("uses the API port default only when the value is absent", () => {
    expect(parseEnvironment({}).API_PORT).toBe(3022);
  });
});
