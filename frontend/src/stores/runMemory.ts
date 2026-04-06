import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";

import { createStyleTemplate } from "../lib/styleSkill";
import type {
  DiscoverResponse,
  RecentRunEntry,
  StylePromptMemoryHint,
  StylePromptTarget,
  StyleTemplate,
  TransformResponse,
  WorkflowArtifact,
  WorkflowStep,
} from "../types";

const MAX_RECENT_RUNS = 12;
const MAX_STORED_ARTIFACTS = 8;
const MAX_STORED_ARTIFACT_PREVIEW = 320;
const MAX_RUN_QUALITY_SCORE = 5;
const MAX_STORED_RESULT_TEXT = 12000;
const LONG_RESULT_THRESHOLD = 9000;
const STYLE_MEMORY_MIN_QUALITY = 3;
const STYLE_MEMORY_MAX_AGE_DAYS = 45;

function truncate(value: string, limit: number) {
  const cleaned = String(value || "");
  if (cleaned.length <= limit) return cleaned;
  return cleaned.slice(0, limit).trimEnd() + "…";
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      (String(value || "").match(/[\u4e00-\u9fffa-zA-Z0-9]{2,}/g) || [])
        .map((token) => token.toLowerCase())
        .filter((token) => token.length >= 2),
    ),
  );
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function getStorageProfile(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get("profile") || "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return cleaned || null;
}

function getStorageKey(baseKey: string): string {
  const profile = getStorageProfile();
  if (!profile) return `vibeshift-${baseKey}`;
  return `vibeshift-${profile}-${baseKey}`;
}

function safeJsonParse(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeStyleSnapshot(value: unknown): StyleTemplate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<StyleTemplate>;
  const id = String(raw.id || "").trim();
  const name = String(raw.name || "").trim();
  const prompt = String(raw.prompt || "").trim();
  if (!id || !name || !prompt) return null;
  return createStyleTemplate({
    id,
    name,
    prompt,
    audience: String(raw.audience ?? ""),
    tone: String(raw.tone ?? ""),
    structure_template: String(raw.structure_template ?? ""),
    emphasis_points: Array.isArray(raw.emphasis_points)
      ? raw.emphasis_points.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
      : [],
    citation_policy:
      raw.citation_policy === "strict" || raw.citation_policy === "minimal" || raw.citation_policy === "none"
        ? raw.citation_policy
        : "auto",
    title_policy: raw.title_policy === "rewrite" || raw.title_policy === "punchy" ? raw.title_policy : "retain",
    image_focus:
      raw.image_focus === "narrative" || raw.image_focus === "diagram" || raw.image_focus === "editorial"
        ? raw.image_focus
        : "auto",
    layout_format:
      raw.layout_format === "newspaper" ||
      raw.layout_format === "poster" ||
      raw.layout_format === "book" ||
      raw.layout_format === "classical" ||
      raw.layout_format === "ppt" ||
      raw.layout_format === "paper" ||
      raw.layout_format === "poetry"
        ? raw.layout_format
        : "auto",
    visual_mode:
      raw.visual_mode === "enhanced" || raw.visual_mode === "minimal" || raw.visual_mode === "none"
        ? raw.visual_mode
        : "auto",
  });
}

function normalizeWorkflowRun(value: unknown): RecentRunEntry["run"] {
  if (!value || typeof value !== "object") return null;
  const raw = value as RecentRunEntry["run"] & Record<string, unknown>;
  const mode = raw.mode === "discover" ? "discover" : raw.mode === "transform" ? "transform" : null;
  const status = raw.status === "completed" || raw.status === "failed" || raw.status === "running" ? raw.status : null;
  const id = String(raw.id || "").trim();
  const workspacePath = String(raw.workspace_path || "").trim();
  if (!mode || !status || !id || !workspacePath) return null;

  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const step = item as unknown as Record<string, unknown>;
          const stepStatus: WorkflowStep["status"] | null =
            step.status === "completed" || step.status === "failed" ? step.status : null;
          const stepId = String(step.id || "").trim();
          const label = String(step.label || "").trim();
          if (!stepStatus || !stepId || !label) return null;
          return {
            id: stepId,
            label,
            status: stepStatus,
            started_at: String(step.started_at || ""),
            finished_at: String(step.finished_at || ""),
            duration_ms: Number.isFinite(Number(step.duration_ms)) ? Number(step.duration_ms) : 0,
            detail: String(step.detail || ""),
          };
        })
        .filter(isPresent)
    : [];

  const artifacts = Array.isArray(raw.artifacts)
    ? raw.artifacts
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const artifact = item as unknown as Record<string, unknown>;
          const kind: WorkflowArtifact["kind"] | null =
            artifact.kind === "source" ||
            artifact.kind === "sources" ||
            artifact.kind === "context" ||
            artifact.kind === "outline" ||
            artifact.kind === "evidence" ||
            artifact.kind === "brief" ||
            artifact.kind === "draft" ||
            artifact.kind === "report" ||
            artifact.kind === "image_prompts"
              ? artifact.kind
              : null;
          const allowedKinds = new Set(["source", "sources", "context", "outline", "evidence", "brief", "draft", "report", "image_prompts"]);
          if (!kind || !allowedKinds.has(kind)) return null;
          const artifactId = String(artifact.id || "").trim();
          const label = String(artifact.label || "").trim();
          const path = String(artifact.path || "").trim();
          if (!artifactId || !label || !path) return null;
          return {
            id: artifactId,
            kind,
            label,
            path,
            mime_type: String(artifact.mime_type || "text/plain"),
            size_bytes: Number.isFinite(Number(artifact.size_bytes)) ? Number(artifact.size_bytes) : 0,
            preview: truncate(String(artifact.preview || ""), MAX_STORED_ARTIFACT_PREVIEW),
            created_at: String(artifact.created_at || ""),
          };
        })
        .filter(isPresent)
        .slice(0, MAX_STORED_ARTIFACTS)
    : [];

  return {
    id,
    mode,
    status,
    workspace_path: workspacePath,
    started_at: String(raw.started_at || ""),
    finished_at: String(raw.finished_at || ""),
    duration_ms: Number.isFinite(Number(raw.duration_ms)) ? Number(raw.duration_ms) : 0,
    title: String(raw.title || ""),
    summary: String(raw.summary || ""),
    steps,
    artifacts,
  };
}

function snapshotRun(run: RecentRunEntry["run"]): RecentRunEntry["run"] {
  return normalizeWorkflowRun(run);
}

function normalizeRecentRuns(value: unknown): RecentRunEntry[] {
  if (!Array.isArray(value)) return [];
  const result: RecentRunEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<RecentRunEntry>;
    const id = String(raw.id || "").trim();
    const mode = raw.mode === "discover" ? "discover" : raw.mode === "transform" ? "transform" : null;
    const title = String(raw.title || "").trim();
    const input = String(raw.input || "");
    if (!id || !mode || !title || !input) continue;
    result.push({
      id,
      mode,
      title,
      input,
      input_preview: String(raw.input_preview || input.slice(0, 140)),
      created_at: String(raw.created_at || new Date().toISOString()),
      style_id: raw.style_id == null ? null : String(raw.style_id),
      style_name: String(raw.style_name || ""),
      style_snapshot: normalizeStyleSnapshot(raw.style_snapshot),
      provider: String(raw.provider || ""),
      model: String(raw.model || ""),
      summary: String(raw.summary || ""),
      result_excerpt: String(raw.result_excerpt || ""),
      result_text: String(raw.result_text || raw.result_excerpt || ""),
      result_truncated: Boolean(raw.result_truncated),
      result_too_long: Boolean(raw.result_too_long),
      brief_summary: String(raw.brief_summary || ""),
      brief_conclusion: String(raw.brief_conclusion || ""),
      brief_key_findings: Array.isArray(raw.brief_key_findings)
        ? raw.brief_key_findings.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6)
        : [],
      source_preview: snapshotSourcePreview(raw.source_preview),
      source_count: Number.isFinite(Number(raw.source_count)) ? Number(raw.source_count) : 0,
      quality_score: clampQualityScore(Number(raw.quality_score ?? 1)),
      restore_count: Math.max(0, Number(raw.restore_count || 0) || 0),
      pinned_for_style_memory: Boolean(raw.pinned_for_style_memory),
      run: normalizeWorkflowRun(raw.run),
    });
  }
  return result.slice(0, MAX_RECENT_RUNS);
}

function buildPreview(input: string) {
  const cleaned = input.trim().replace(/\s+/g, " ");
  return cleaned.slice(0, 140);
}

function buildResultExcerpt(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 180);
}

function snapshotResultText(value: string) {
  const cleaned = String(value || "").trim();
  return {
    text: truncate(cleaned, MAX_STORED_RESULT_TEXT),
    truncated: cleaned.length > MAX_STORED_RESULT_TEXT,
    tooLong: cleaned.length >= LONG_RESULT_THRESHOLD,
  };
}

function snapshotSourcePreview(value: unknown): RecentRunEntry["source_preview"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const title = String(source.title || "").trim();
      const url = String(source.url || "").trim();
      if (!title || !url) return null;
      const relevanceScore = Number(source.relevance_score);
      return {
        id: Number.isFinite(Number(source.id)) ? Number(source.id) : index + 1,
        title,
        url,
        relevance_score: Number.isFinite(relevanceScore) ? relevanceScore : undefined,
      };
    })
    .filter(isPresent)
    .slice(0, 6);
}

function clampQualityScore(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_RUN_QUALITY_SCORE, Math.round(value)));
}

function computeInitialQualityScore(params: {
  mode: RecentRunEntry["mode"];
  resultExcerpt: string;
  sourceCount: number;
  run: RecentRunEntry["run"];
}) {
  let score = 1;
  if (params.resultExcerpt.length >= 72) score += 1;
  if (params.mode === "discover" && params.sourceCount >= 3) score += 1;
  if ((params.run?.artifacts?.length || 0) >= 2) score += 1;
  if (params.run?.status === "completed") score += 1;
  return clampQualityScore(score);
}

function toStyleMemoryHint(entry: RecentRunEntry): StylePromptMemoryHint | null {
  const snapshot = entry.style_snapshot;
  if (!snapshot?.prompt?.trim()) return null;
  const target: StylePromptTarget = entry.mode === "discover" ? "discover" : "rewrite";
  const promptExcerpt = truncate([entry.title, entry.summary, entry.input_preview].filter(Boolean).join(" · "), 220);
  return {
    target,
    prompt_excerpt: promptExcerpt,
    optimized_prompt: snapshot.prompt.trim(),
    profile_suggestion: {
      audience: snapshot.audience || "",
      tone: snapshot.tone || "",
      structure_template: snapshot.structure_template || "",
      emphasis_points: snapshot.emphasis_points || [],
      citation_policy: snapshot.citation_policy,
      title_policy: snapshot.title_policy,
      image_focus: snapshot.image_focus,
      layout_format: snapshot.layout_format,
      visual_mode: snapshot.visual_mode,
    },
    source_style_name: snapshot.name || entry.style_name || "历史风格",
    accepted_at: entry.created_at || null,
    usage_count: Math.max(1, Math.min(6, 1 + Math.floor((entry.source_count || 0) / 2))),
  };
}

function scoreStyleHint(entry: RecentRunEntry, hint: StylePromptMemoryHint, prompt: string, target: StylePromptTarget) {
  if (hint.target !== target) return -1;
  const promptTokens = tokenize(prompt);
  const memoryTokens = tokenize(
    [
      entry.title,
      entry.summary,
      entry.result_excerpt,
      entry.input_preview,
      hint.optimized_prompt,
      hint.profile_suggestion.tone,
      hint.profile_suggestion.structure_template,
      ...(hint.profile_suggestion.emphasis_points || []),
    ].join(" "),
  );
  const overlap = promptTokens.filter((token) => memoryTokens.includes(token)).length;
  const strongMemory = entry.pinned_for_style_memory || entry.quality_score >= 3 || entry.restore_count >= 2;
  if (overlap === 0 && !strongMemory) return -1;
  const completedBonus = entry.run?.status === "completed" || entry.run == null ? 3 : 0;
  const artifactBonus = Math.min(entry.run?.artifacts?.length || 0, 4);
  const excerptBonus = entry.result_excerpt.length >= 48 ? 2 : 0;
  const pinnedBonus = entry.pinned_for_style_memory ? 20 : 0;
  const qualityBonus = entry.quality_score * 3;
  const restoreBonus = Math.min(entry.restore_count, 6) * 2;
  return overlap * 10 + completedBonus + artifactBonus + excerptBonus + pinnedBonus + qualityBonus + restoreBonus + Math.min(hint.usage_count, 6);
}

function isEligibleStyleMemoryEntry(entry: RecentRunEntry) {
  if (!entry.style_snapshot?.prompt?.trim()) return false;
  if (entry.quality_score < STYLE_MEMORY_MIN_QUALITY && !entry.pinned_for_style_memory) return false;
  const createdAt = new Date(entry.created_at).getTime();
  if (!Number.isFinite(createdAt)) return entry.pinned_for_style_memory;
  const ageDays = Math.max(0, (Date.now() - createdAt) / 86400000);
  return ageDays <= STYLE_MEMORY_MAX_AGE_DAYS || entry.pinned_for_style_memory;
}

function persistRecentRuns(storageKey: string, value: RecentRunEntry[]) {
  let next = value.slice(0, MAX_RECENT_RUNS);
  while (next.length > 0) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    } catch {
      next = next.slice(0, -1);
    }
  }
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures and keep in-memory state.
  }
  return [];
}

export const useRunMemoryStore = defineStore("run-memory", () => {
  const RECENT_RUNS_KEY = getStorageKey("recent-runs");
  const recentRuns = ref<RecentRunEntry[]>(normalizeRecentRuns(safeJsonParse(localStorage.getItem(RECENT_RUNS_KEY))));

  watch(
    recentRuns,
    (value) => {
      const persisted = persistRecentRuns(RECENT_RUNS_KEY, value);
      if (persisted.length !== value.length) {
        recentRuns.value = persisted;
      }
    },
    { deep: true, immediate: true },
  );

  function upsertEntry(entry: RecentRunEntry) {
    recentRuns.value = [entry, ...recentRuns.value.filter((item) => item.id !== entry.id)].slice(0, MAX_RECENT_RUNS);
  }

  function recordTransformRun(params: {
    input: string;
    style: StyleTemplate | null;
    response: TransformResponse;
  }) {
    const snapshot = snapshotRun(params.response.run || null);
    const resultExcerpt = buildResultExcerpt(params.response.transformed_text);
    const resultSnapshot = snapshotResultText(params.response.transformed_text);
    const sourceCount = params.response.source_url ? 1 : 0;
    upsertEntry({
      id: params.response.request_id,
      mode: "transform",
      title: params.response.title,
      input: params.input,
      input_preview: buildPreview(params.input),
      created_at: new Date().toISOString(),
      style_id: params.style?.id || null,
      style_name: params.style?.name || "",
      style_snapshot: params.style ? { ...params.style } : null,
      provider: params.response.meta.provider,
      model: params.response.meta.model,
      summary: params.response.run?.summary || params.response.raw_excerpt,
      result_excerpt: resultExcerpt,
      result_text: resultSnapshot.text,
      result_truncated: resultSnapshot.truncated,
      result_too_long: resultSnapshot.tooLong,
      brief_summary: "",
      brief_conclusion: "",
      brief_key_findings: [],
      source_preview: [],
      source_count: sourceCount,
      quality_score: computeInitialQualityScore({
        mode: "transform",
        resultExcerpt,
        sourceCount,
        run: snapshot,
      }),
      restore_count: 0,
      pinned_for_style_memory: false,
      run: snapshot,
    });
  }

  function recordDiscoverRun(params: {
    input: string;
    style: StyleTemplate | null;
    response: DiscoverResponse;
  }) {
    const snapshot = snapshotRun(params.response.run || null);
    const resultExcerpt = buildResultExcerpt(params.response.transformed_text);
    const resultSnapshot = snapshotResultText(params.response.transformed_text);
    const sourceCount = params.response.sources.length;
    upsertEntry({
      id: params.response.request_id,
      mode: "discover",
      title: params.response.title,
      input: params.input,
      input_preview: buildPreview(params.input),
      created_at: new Date().toISOString(),
      style_id: params.style?.id || null,
      style_name: params.style?.name || "",
      style_snapshot: params.style ? { ...params.style } : null,
      provider: params.response.meta.provider,
      model: params.response.meta.model,
      summary: params.response.run?.summary || params.response.brief.summary || `整理 ${params.response.sources.length} 个来源`,
      result_excerpt: resultExcerpt,
      result_text: resultSnapshot.text,
      result_truncated: resultSnapshot.truncated,
      result_too_long: resultSnapshot.tooLong,
      brief_summary: params.response.brief.summary || "",
      brief_conclusion: params.response.brief.conclusion || "",
      brief_key_findings: params.response.brief.key_findings.slice(0, 6),
      source_preview: params.response.sources.slice(0, 6).map((item) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        relevance_score: item.relevance_score,
      })),
      source_count: sourceCount,
      quality_score: computeInitialQualityScore({
        mode: "discover",
        resultExcerpt,
        sourceCount,
        run: snapshot,
      }),
      restore_count: 0,
      pinned_for_style_memory: false,
      run: snapshot,
    });
  }

  function removeRecentRun(id: string) {
    recentRuns.value = recentRuns.value.filter((item) => item.id !== id);
  }

  function clearRecentRuns() {
    try {
      localStorage.removeItem(RECENT_RUNS_KEY);
    } catch {
      // Ignore storage failures and still clear in-memory state.
    }
    recentRuns.value = [];
  }

  const hasRecentRuns = computed(() => recentRuns.value.length > 0);
  const pinnedRecentRuns = computed(() =>
    recentRuns.value
      .filter((entry) => entry.pinned_for_style_memory)
      .slice()
      .sort((left, right) => {
        if (right.quality_score !== left.quality_score) return right.quality_score - left.quality_score;
        if (right.restore_count !== left.restore_count) return right.restore_count - left.restore_count;
        return String(right.created_at).localeCompare(String(left.created_at));
      })
      .slice(0, 4),
  );

  function toggleStyleMemoryPin(id: string) {
    recentRuns.value = recentRuns.value.map((entry) => {
      if (entry.id !== id) return entry;
      const nextPinned = !entry.pinned_for_style_memory;
      return {
        ...entry,
        pinned_for_style_memory: nextPinned,
        quality_score: clampQualityScore(entry.quality_score + (nextPinned ? 1 : -1)),
      };
    });
  }

  function markRunRestored(id: string) {
    recentRuns.value = recentRuns.value.map((entry) => {
      if (entry.id !== id) return entry;
      return {
        ...entry,
        restore_count: entry.restore_count + 1,
        quality_score: clampQualityScore(entry.quality_score + 1),
      };
    });
  }

  function getReusableStyleHints(prompt: string, target: StylePromptTarget, limit = 3): StylePromptMemoryHint[] {
    const cleanedPrompt = prompt.trim();
    if (!cleanedPrompt) return [];
    return recentRuns.value
      .filter(isEligibleStyleMemoryEntry)
      .map((entry) => {
        const hint = toStyleMemoryHint(entry);
        if (!hint) return null;
        return {
          hint,
          score: scoreStyleHint(entry, hint, cleanedPrompt, target),
        };
      })
      .filter(isPresent)
      .filter((item) => item.score >= 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((item) => item.hint);
  }

  return {
    recentRuns,
    hasRecentRuns,
    pinnedRecentRuns,
    recordTransformRun,
    recordDiscoverRun,
    getReusableStyleHints,
    toggleStyleMemoryPin,
    markRunRestored,
    removeRecentRun,
    clearRecentRuns,
  };
});
