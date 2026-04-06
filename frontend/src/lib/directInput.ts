const URL_PRESENCE_PATTERN = /https?:\/\/\S+/i;

export type DirectModeHint = "url" | "text" | "discover";

export type DirectLaunchConfig = {
  input: string;
  mode: DirectModeHint | null;
  style: string;
  autorun: boolean;
};

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeCandidate(value: string) {
  const decoded = safeDecode(String(value || "").trim());
  return decoded.replace(/^\/+/, "").trim();
}

function normalizeMode(value: string | null): DirectModeHint | null {
  if (value === "url" || value === "text" || value === "discover") return value;
  return null;
}

function normalizeAutorun(value: string | null) {
  if (!value) return true;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

export function parseDirectLaunchConfigFromLocation(locationLike: Pick<Location, "pathname" | "search" | "hash">): DirectLaunchConfig {
  const searchParams = new URLSearchParams(locationLike.search || "");
  const candidates = [
    searchParams.get("input") || "",
    normalizeCandidate(locationLike.pathname || ""),
    normalizeCandidate((locationLike.hash || "").replace(/^#/, "")),
  ];

  let input = "";
  for (const raw of candidates) {
    const candidate = normalizeCandidate(raw);
    if (!candidate) continue;
    if (URL_PRESENCE_PATTERN.test(candidate)) {
      input = candidate;
      break;
    }
  }

  return {
    input,
    mode: normalizeMode(searchParams.get("mode")),
    style: normalizeCandidate(searchParams.get("style") || ""),
    autorun: normalizeAutorun(searchParams.get("autorun")),
  };
}

export function parseDirectInputFromLocation(locationLike: Pick<Location, "pathname" | "search" | "hash">) {
  return parseDirectLaunchConfigFromLocation(locationLike).input;
}
