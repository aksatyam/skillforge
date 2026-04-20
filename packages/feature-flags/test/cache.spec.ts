import { describe, expect, it } from "vitest";
import { TtlCache } from "../src/cache";

describe("TtlCache", () => {
  it("returns set values within TTL", () => {
    const c = new TtlCache<boolean>(1000);
    c.set("k", true, undefined, 0);
    expect(c.get("k", 500)).toBe(true);
  });

  it("returns undefined after TTL expires and evicts the entry", () => {
    const c = new TtlCache<boolean>(1000);
    c.set("k", true, undefined, 0);
    expect(c.get("k", 1001)).toBeUndefined();
    expect(c.size()).toBe(0); // lazy eviction on get
  });

  it("honors per-entry TTL override", () => {
    const c = new TtlCache<number>(1000);
    c.set("a", 1, 100, 0);
    c.set("b", 2, 5000, 0);
    expect(c.get("a", 101)).toBeUndefined();
    expect(c.get("b", 101)).toBe(2);
  });

  it("rejects non-positive default TTL (programmer error)", () => {
    expect(() => new TtlCache<string>(0)).toThrow();
    expect(() => new TtlCache<string>(-5)).toThrow();
  });

  it("delete removes the entry immediately", () => {
    const c = new TtlCache<boolean>(1000);
    c.set("k", true);
    c.delete("k");
    expect(c.get("k")).toBeUndefined();
  });

  it("clear wipes everything", () => {
    const c = new TtlCache<number>(1000);
    c.set("a", 1);
    c.set("b", 2);
    c.clear();
    expect(c.size()).toBe(0);
  });
});
