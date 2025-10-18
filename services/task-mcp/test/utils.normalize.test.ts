import { describe, expect, it } from "vitest";
import { fingerprint, normalizeForFingerprint } from "../src/utils/normalize.js";

describe("normalizeForFingerprint", () => {
  it("produces identical fingerprints for objects with keys in different order", () => {
    const a = { alpha: 1, beta: { nested: true, list: [1, 2, 3] }, gamma: "ok" };
    const b = { gamma: "ok", beta: { list: [1, 2, 3], nested: true }, alpha: 1 };

    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("produces different fingerprints for arrays with different order", () => {
    const first = [1, 2, 3];
    const second = [3, 2, 1];

    expect(fingerprint(normalizeForFingerprint(first))).not.toBe(fingerprint(normalizeForFingerprint(second)));
  });

  it("handles nested object / array mixes deterministically", () => {
    const value = { users: [{ id: 1, tags: ['a', 'b'] }, { id: 2, tags: ['c'] }], flag: true };
    const clone = normalizeForFingerprint(value);

    expect(fingerprint(value)).toBe(fingerprint(clone));
  });
});
