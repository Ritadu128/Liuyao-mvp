import { describe, expect, it } from "vitest";
import { getDevelopmentPreferredPort, getProductionPort } from "./_core/port";

describe("production port selection", () => {
  it("requires an explicit valid platform port", () => {
    expect(getProductionPort("3000")).toBe(3000);
    expect(() => getProductionPort(undefined)).toThrow("PORT is required in production.");
    expect(() => getProductionPort("0")).toThrow("PORT must be an integer");
    expect(() => getProductionPort("not-a-port")).toThrow("PORT must be an integer");
    expect(() => getProductionPort("65536")).toThrow("PORT must be an integer");
  });
});

describe("development port selection", () => {
  it("keeps a local default for missing or malformed values", () => {
    expect(getDevelopmentPreferredPort(undefined)).toBe(3000);
    expect(getDevelopmentPreferredPort("invalid")).toBe(3000);
    expect(getDevelopmentPreferredPort("3010")).toBe(3010);
  });
});
