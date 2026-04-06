export type InputType = "url" | "text";
export type DetectedMode = "url" | "text" | "discover";

export interface LLMConfig {
  provider: string;
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
}

export interface ImageConfig {
  enabled: boolean;
  provider: string | null;
  base_url: string | null;
  api_key: string | null;
  model: string | null;
  count: number;
  style_preset: string;
  custom_prompt: string;
  placement: "header" | "interleave" | "footer";
  smart_mode: boolean;
  smart_max_count: number;
  async_generation?: boolean;
  retry_on_failure: boolean;
  retry_strategy: "simplify_prompt" | "fallback_model";
  fallback_model: string | null;
}

export type StyleCitationPolicy = "auto" | "strict" | "minimal" | "none";
export type StyleTitlePolicy = "retain" | "rewrite" | "punchy";
export type StyleImageFocus = "auto" | "narrative" | "diagram" | "editorial";
export type StyleLayoutFormat = "auto" | "newspaper" | "poster" | "book" | "classical" | "ppt" | "paper" | "poetry";
export type StyleVisualMode = "auto" | "enhanced" | "minimal" | "none";
export type FunctionSkillId =
  | "summary_first"
  | "multi_source_merge"
  | "long_context_rewrite"
  | "evidence_first"
  | "visual_pretext"
  | "image_planning"
  | "style_fidelity"
  | "share_ready";

export interface ImageEstimateConfig {
  enabled: boolean;
  count: number;
  placement: "header" | "interleave" | "footer";
}

export interface StyleSkillProfile {
  name: string;
  audience: string;
  tone: string;
  structure_template: string;
  emphasis_points: string[];
  citation_policy: StyleCitationPolicy;
  title_policy: StyleTitlePolicy;
  image_focus: StyleImageFocus;
  layout_format: StyleLayoutFormat;
  visual_mode: StyleVisualMode;
  function_skills?: FunctionSkill[];
}

export interface FunctionSkill {
  id: FunctionSkillId;
  label: string;
  instruction: string;
}

export interface StyleTemplate extends StyleSkillProfile {
  id: string;
  prompt: string;
}

export interface TransformBasePayload {
  input_type: InputType;
  input: string;
  style_prompt: string;
  style_profile?: StyleSkillProfile | null;
  llm: LLMConfig;
  cache?: {
    enabled: boolean;
  };
}

export interface TransformPayload extends TransformBasePayload {
  image: ImageConfig;
}

export interface CostPricing {
  prompt_usd_per_1k: number;
  completion_usd_per_1k: number;
  image_usd_each?: number | null;
}

export interface CostPricingSettings {
  enabled: boolean;
  prompt_usd_per_1k: number;
  completion_usd_per_1k: number;
  image_usd_each: number | null;
}

export interface CostEstimatePayload extends TransformBasePayload {
  image: ImageEstimateConfig;
  pricing?: CostPricing | null;
}

export interface CostEstimateResponse {
  prompt_tokens: number;
  completion_tokens_max: number;
  total_tokens_max: number;
  chunking: {
    enabled: boolean;
    chunks: number;
    rewrite_calls: number;
    merge_calls: number;
  };
  images: {
    enabled: boolean;
    calls: number;
  };
  cost_usd?: {
    prompt: number;
    completion_max: number;
    images: number;
    total_max: number;
  } | null;
  notes: string[];
}

export interface ImageRegeneratePayload {
  image_id: string;
  prompt: string;
  image: ImageConfig;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
}

export type WorkflowRunMode = "transform" | "discover";
export type WorkflowRunStatus = "running" | "completed" | "failed";
export type WorkflowStepStatus = "completed" | "failed";
export type ArtifactKind = "source" | "sources" | "context" | "outline" | "evidence" | "brief" | "draft" | "report" | "image_prompts";

export interface WorkflowArtifact {
  id: string;
  kind: ArtifactKind;
  label: string;
  path: string;
  mime_type: string;
  size_bytes: number;
  preview: string;
  created_at: string;
}

export interface WorkflowStep {
  id: string;
  label: string;
  status: WorkflowStepStatus;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  detail: string;
}

export interface WorkflowRun {
  id: string;
  mode: WorkflowRunMode;
  status: WorkflowRunStatus;
  workspace_path: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  title: string;
  summary: string;
  steps: WorkflowStep[];
  artifacts: WorkflowArtifact[];
}

export interface TransformResponse {
  request_id: string;
  title: string;
  source_url?: string | null;
  raw_excerpt: string;
  transformed_text: string;
  images: GeneratedImage[];
  image_prompts?: string[] | null;
  meta: {
    input_type: InputType;
    provider: string;
    model: string;
    duration_ms: number;
    used_cache: boolean;
  };
  run?: WorkflowRun | null;
}

export interface ApiError {
  error?: {
    code: string;
    message: string;
    suggestion: string;
    details?: string;
  };
}

export interface SearchSource {
  id: number;
  title: string;
  url: string;
  snippet: string;
  excerpt: string;
  source_type?: string;
  relevance_score?: number;
  credibility_score?: number;
  overall_score?: number;
  capture_mode?: "full" | "snippet";
}

export interface DiscoverEvidenceItem {
  source_id: number;
  title: string;
  url: string;
  quote?: string;
  evidence: string;
  relevance: string;
}

export interface DiscoverBrief {
  summary: string;
  conclusion: string;
  key_findings: string[];
  evidence: DiscoverEvidenceItem[];
  uncertainties: string[];
  draft_outline: string[];
}

export type DiscoverResumeStage = "sources" | "brief" | "draft";

export interface DiscoverResumeOptions {
  run_id: string;
  stage: DiscoverResumeStage;
}

export interface DiscoverPayload {
  query: string;
  style_prompt: string;
  style_profile?: StyleSkillProfile | null;
  llm: LLMConfig;
  resume?: DiscoverResumeOptions | null;
  cache?: {
    enabled: boolean;
  };
}

export interface DiscoverResponse {
  request_id: string;
  title: string;
  transformed_text: string;
  brief: DiscoverBrief;
  sources: SearchSource[];
  meta: {
    provider: string;
    model: string;
    duration_ms: number;
    used_cache: boolean;
    followup_used: boolean;
    sources: number;
    evidence_items: number;
    uncertainties: number;
    resumed: boolean;
    resume_stage?: DiscoverResumeStage | null;
  };
  run?: WorkflowRun | null;
}

export interface RecentRunEntry {
  id: string;
  mode: "transform" | "discover";
  title: string;
  input: string;
  input_preview: string;
  created_at: string;
  style_id: string | null;
  style_name: string;
  style_snapshot: StyleTemplate | null;
  provider: string;
  model: string;
  summary: string;
  result_excerpt: string;
  result_text: string;
  result_truncated: boolean;
  result_too_long: boolean;
  brief_summary?: string;
  brief_conclusion?: string;
  brief_key_findings?: string[];
  source_preview?: Pick<SearchSource, "id" | "title" | "url" | "relevance_score">[];
  source_count: number;
  quality_score: number;
  restore_count: number;
  pinned_for_style_memory: boolean;
  run: WorkflowRun | null;
}

export type StylePromptTarget = "rewrite" | "discover";

export interface StyleProfileSuggestion {
  audience: string;
  tone: string;
  structure_template: string;
  emphasis_points: string[];
  citation_policy: StyleCitationPolicy;
  title_policy: StyleTitlePolicy;
  image_focus: StyleImageFocus;
  layout_format: StyleLayoutFormat;
  visual_mode: StyleVisualMode;
}

export interface StylePromptMemoryHint {
  target: StylePromptTarget;
  prompt_excerpt: string;
  optimized_prompt: string;
  profile_suggestion: StyleProfileSuggestion;
  source_style_name: string;
  accepted_at: string | null;
  usage_count: number;
}

export interface StylePromptOptimizePayload {
  prompt: string;
  target: StylePromptTarget;
  llm: LLMConfig;
  current_profile?: StyleProfileSuggestion | null;
  memory_hints?: StylePromptMemoryHint[];
}

export interface StylePromptOptimizeResponse {
  optimized_prompt: string;
  notes: string[];
  profile_suggestion?: StyleProfileSuggestion | null;
}
