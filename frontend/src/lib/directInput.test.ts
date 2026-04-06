import { describe, expect, it } from "vitest";

import { parseDirectInputFromLocation, parseDirectLaunchConfigFromLocation } from "./directInput";

describe("parseDirectInputFromLocation", () => {
  it("reads a direct url from pathname", () => {
    expect(
      parseDirectInputFromLocation({
        pathname: "/https://www.tsinghua.edu.cn/info/1182/124190.htm",
        search: "",
        hash: "",
      }),
    ).toBe("https://www.tsinghua.edu.cn/info/1182/124190.htm");
  });

  it("supports multiple appended urls in pathname", () => {
    expect(
      parseDirectInputFromLocation({
        pathname: "/https://example.com/a%20https://example.com/b",
        search: "",
        hash: "",
      }),
    ).toBe("https://example.com/a https://example.com/b");
  });

  it("falls back to query input parameter", () => {
    expect(
      parseDirectInputFromLocation({
        pathname: "/",
        search: "?input=https%3A%2F%2Fexample.com%2Fa",
        hash: "",
      }),
    ).toBe("https://example.com/a");
  });

  it("parses style, mode and autorun flags", () => {
    expect(
      parseDirectLaunchConfigFromLocation({
        pathname: "/https://example.com/a",
        search: "?style=humor&mode=url&autorun=0",
        hash: "",
      }),
    ).toEqual({
      input: "https://example.com/a",
      style: "humor",
      mode: "url",
      autorun: false,
    });
  });
});
