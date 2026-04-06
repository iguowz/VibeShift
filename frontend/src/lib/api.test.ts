import axios from "axios";

import { isRequestCanceled, resolveApiError } from "./api";

describe("api helpers", () => {
  it("detects axios cancellation errors", () => {
    const canceled = new axios.CanceledError("canceled");
    expect(isRequestCanceled(canceled)).toBe(true);
  });

  it("detects compatible canceled error shapes", () => {
    expect(isRequestCanceled({ code: "ERR_CANCELED" })).toBe(true);
    expect(isRequestCanceled({ name: "CanceledError" })).toBe(true);
    expect(isRequestCanceled(new Error("boom"))).toBe(false);
  });

  it("maps 504 responses to a long-task gateway timeout message", () => {
    const resolved = resolveApiError(
      { response: { status: 504 } },
      "探索发现失败。",
      "默认建议",
    );

    expect(resolved.message).toBe("探索发现耗时过长，网关已超时。");
    expect(resolved.suggestion).toContain("当前检索或模型生成耗时较长");
  });

  it("maps client timeouts to a request-timeout message", () => {
    const resolved = resolveApiError(
      { code: "ECONNABORTED", message: "timeout of 180000ms exceeded" },
      "探索发现失败。",
      "默认建议",
    );

    expect(resolved.message).toBe("探索发现请求超时。");
    expect(resolved.suggestion).toContain("当前模型响应较慢");
  });

  it("maps transform timeouts to a transform-specific timeout message", () => {
    const resolved = resolveApiError(
      { code: "ECONNABORTED", message: "timeout of 180000ms exceeded" },
      "请求失败，未获取到转换结果。",
      "默认建议",
    );

    expect(resolved.message).toBe("转换请求超时。");
    expect(resolved.suggestion).toContain("链接抓取或模型生成耗时较长");
  });

  it("prefers structured backend errors when present", () => {
    const resolved = resolveApiError(
      {
        response: {
          status: 424,
          data: {
            error: {
              code: "discover_no_sources",
              message: "未找到可用资料来源，无法完成探索发现。",
              suggestion: "请尝试换一种关键词描述。",
            },
          },
        },
      },
      "探索发现失败。",
      "默认建议",
    );

    expect(resolved.message).toBe("未找到可用资料来源，无法完成探索发现。");
    expect(resolved.suggestion).toBe("请尝试换一种关键词描述。");
  });
});
