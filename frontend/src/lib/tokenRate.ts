function isCjkChar(code: number) {
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0x3040 && code <= 0x30ff) || // Japanese Hiragana/Katakana
    (code >= 0xac00 && code <= 0xd7af) // Hangul
  );
}

export function estimateTokens(text: string): number {
  const input = (text || "").trim();
  if (!input) return 0;

  let cjk = 0;
  let other = 0;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    const ch = input[index];
    if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") continue;
    if (isCjkChar(code)) {
      cjk += 1;
    } else {
      other += 1;
    }
  }

  // Heuristic: CJK ≈ 1 char/token; non-CJK ≈ 4 chars/token
  return Math.ceil(cjk * 1.0 + other / 4);
}

export function computeTokenRateK(text: string, durationMs: number): number {
  const tokens = estimateTokens(text);
  const seconds = Math.max(0.2, durationMs / 1000);
  const rate = tokens / seconds;
  return rate / 1000;
}

export function gradeFromTokenRateK(rateK: number): 1 | 2 | 3 | 4 | 5 {
  if (!(rateK > 0)) return 1;
  if (rateK < 0.02) return 1; // < 20 tok/s
  if (rateK < 0.05) return 2; // < 50 tok/s
  if (rateK < 0.1) return 3; // < 100 tok/s
  if (rateK < 0.2) return 4; // < 200 tok/s
  return 5;
}

type TokenRateSample = {
  ts: number;
  rate_k: number;
};

const TOKEN_RATE_WINDOW_MS = 10 * 60 * 1000;
const TOKEN_RATE_MAX_SAMPLES = 120;

function getStorageProfile(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get("profile") || "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return cleaned || null;
}

function getHistoryStorageKey(): string {
  const profile = getStorageProfile();
  if (!profile) return "vibeshift-token-rate-history";
  return `vibeshift-${profile}-token-rate-history`;
}

function safeParseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeHistory(value: unknown): TokenRateSample[] {
  if (!Array.isArray(value)) return [];
  const result: TokenRateSample[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<TokenRateSample>;
    const ts = Number(raw.ts);
    const rateK = Number(raw.rate_k);
    if (!Number.isFinite(ts) || !Number.isFinite(rateK) || !(rateK >= 0)) continue;
    result.push({ ts, rate_k: rateK });
  }
  return result;
}

function averageRateK(samples: TokenRateSample[]): number | null {
  if (!samples.length) return null;
  const sum = samples.reduce((acc, item) => acc + item.rate_k, 0);
  const avg = sum / samples.length;
  return Number.isFinite(avg) ? avg : null;
}

export function updateTokenRateWindowAverageK(currentRateK: number, nowMs = Date.now()): number | null {
  const key = getHistoryStorageKey();
  const stored = normalizeHistory(safeParseJson(localStorage.getItem(key)));
  const windowStart = nowMs - TOKEN_RATE_WINDOW_MS;
  const recent = stored.filter((item) => item.ts >= windowStart && item.ts <= nowMs);

  const next = [...recent, { ts: nowMs, rate_k: currentRateK }]
    .slice(-TOKEN_RATE_MAX_SAMPLES);
  localStorage.setItem(key, JSON.stringify(next));
  return averageRateK(next);
}
