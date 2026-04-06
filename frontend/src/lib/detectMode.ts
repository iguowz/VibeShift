import type { DetectedMode } from "../types";

const URL_EXTRACT_PATTERN = /https?:\/\/[^\s,，;；]+/gi;

export function detectMode(input: string): DetectedMode {
  const trimmed = (input || "").trim();
  if (!trimmed) return "discover";
  const urlMatches = (trimmed.match(URL_EXTRACT_PATTERN) || []).length;
  if (urlMatches >= 2) return "url";
  const lines = trimmed.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every((item) => /^https?:\/\//i.test(item))) return "url";
  if (/^https?:\/\//i.test(trimmed)) return "url";
  if (trimmed.includes("\n")) return "text";
  if (trimmed.length >= 120) return "text";
  return "discover";
}
