import { describe, expect, it } from "vitest";

import {
  computeTokenRateK,
  estimateTokens,
  gradeFromTokenRateK,
  updateTokenRateWindowAverageK,
} from "./tokenRate";

describe("tokenRate", () => {
  it("estimates tokens for CJK", () => {
    expect(estimateTokens("你好世界")).toBeGreaterThan(0);
  });

  it("computes K rate and grade", () => {
    const rateK = computeTokenRateK("a".repeat(400), 1000);
    expect(rateK).toBeGreaterThan(0);
    expect(gradeFromTokenRateK(rateK)).toBeGreaterThanOrEqual(1);
  });

  it("uses 10min window average when available", () => {
    localStorage.clear();
    const now = Date.now();
    const avg1 = updateTokenRateWindowAverageK(0.1, now);
    expect(avg1).toBeCloseTo(0.1, 6);

    const avg2 = updateTokenRateWindowAverageK(0.2, now + 1000);
    expect(avg2).toBeCloseTo(0.15, 6);

    expect(gradeFromTokenRateK(avg2!)).toBeGreaterThanOrEqual(1);
  });
});
