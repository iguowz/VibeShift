import { describe, expect, it } from "vitest";

import { detectMode } from "./detectMode";

describe("detectMode", () => {
  it("detects url", () => {
    expect(detectMode("https://example.com")).toBe("url");
  });

  it("detects text when long", () => {
    expect(detectMode("a".repeat(130))).toBe("text");
  });

  it("detects text when multiline", () => {
    expect(detectMode("hello\nworld")).toBe("text");
  });

  it("detects url when multiple urls are separated by newlines", () => {
    expect(detectMode("https://example.com/a\nhttps://example.com/b")).toBe("url");
  });

  it("detects url when multiple urls are appended in one line", () => {
    expect(detectMode("https://example.com/a https://example.com/b")).toBe("url");
    expect(detectMode("主链接：https://example.com/a，补充链接：https://example.com/b")).toBe("url");
  });

  it("detects discover for short keyword", () => {
    expect(detectMode("fastapi 最佳实践")).toBe("discover");
  });
});
