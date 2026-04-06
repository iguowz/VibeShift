import { afterEach } from "vitest";
import { vi } from "vitest";

afterEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "";
  window.history.pushState({}, "", "/");
});

Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
  },
  configurable: true,
});

Object.defineProperty(window, "ClipboardItem", {
  value: class ClipboardItemMock {
    items: Record<string, Blob>;
    constructor(items: Record<string, Blob>) {
      this.items = items;
    }
  },
  configurable: true,
});
