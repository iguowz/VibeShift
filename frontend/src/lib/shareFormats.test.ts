import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exportHtmlToPdf } from "./shareFormats";

describe("shareFormats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("writes printable html directly into the popup document", async () => {
    const docOpen = vi.fn();
    const docWrite = vi.fn();
    const docClose = vi.fn();
    const popup = {
      document: {
        open: docOpen,
        write: docWrite,
        close: docClose,
      },
      focus: vi.fn(),
    } as any;

    vi.spyOn(window, "open").mockReturnValue(popup);

    exportHtmlToPdf("测试导出", "<p class=\"hidden\" style=\"display:none\">正文内容</p>");
    await vi.runAllTimersAsync();

    expect(window.open).toHaveBeenCalledWith("", "_blank", "width=960,height=720");
    expect(docOpen).toHaveBeenCalled();
    expect(docWrite).toHaveBeenCalledTimes(1);
    const printableHtml = docWrite.mock.calls[0]?.[0] as string;
    expect(printableHtml).toContain("打印 / 另存为 PDF");
    expect(printableHtml).toContain("正文内容");
    expect(printableHtml).not.toContain("display:none");
    expect(printableHtml).not.toContain("class=\"hidden\"");
    expect(docClose).toHaveBeenCalled();
    expect(popup.focus).toHaveBeenCalled();
  });
});
