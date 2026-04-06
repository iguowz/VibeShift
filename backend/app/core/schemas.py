from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import AnyHttpUrl, BaseModel, Field, SecretStr, field_validator, model_validator


class InputType(str, Enum):
    URL = "url"
    TEXT = "text"
    DISCOVER = "discover"


class ImagePlacement(str, Enum):
    HEADER = "header"
    INTERLEAVE = "interleave"
    FOOTER = "footer"

class ImageRetryStrategy(str, Enum):
    SIMPLIFY_PROMPT = "simplify_prompt"
    FALLBACK_MODEL = "fallback_model"


class WorkflowRunMode(str, Enum):
    TRANSFORM = "transform"
    DISCOVER = "discover"


class WorkflowRunStatus(str, Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class WorkflowStepStatus(str, Enum):
    COMPLETED = "completed"
    FAILED = "failed"


class ArtifactKind(str, Enum):
    SOURCE = "source"
    SOURCES = "sources"
    CONTEXT = "context"
    OUTLINE = "outline"
    EVIDENCE = "evidence"
    BRIEF = "brief"
    DRAFT = "draft"
    REPORT = "report"
    IMAGE_PROMPTS = "image_prompts"


class StyleCitationPolicy(str, Enum):
    AUTO = "auto"
    STRICT = "strict"
    MINIMAL = "minimal"
    NONE = "none"


class StyleTitlePolicy(str, Enum):
    RETAIN = "retain"
    REWRITE = "rewrite"
    PUNCHY = "punchy"


class StyleImageFocus(str, Enum):
    AUTO = "auto"
    NARRATIVE = "narrative"
    DIAGRAM = "diagram"
    EDITORIAL = "editorial"


class StyleLayoutFormat(str, Enum):
    AUTO = "auto"
    NEWSPAPER = "newspaper"
    POSTER = "poster"
    BOOK = "book"
    CLASSICAL = "classical"
    PPT = "ppt"
    PAPER = "paper"
    POETRY = "poetry"


class StyleVisualMode(str, Enum):
    AUTO = "auto"
    ENHANCED = "enhanced"
    MINIMAL = "minimal"
    NONE = "none"


class FunctionSkillId(str, Enum):
    SUMMARY_FIRST = "summary_first"
    MULTI_SOURCE_MERGE = "multi_source_merge"
    LONG_CONTEXT_REWRITE = "long_context_rewrite"
    EVIDENCE_FIRST = "evidence_first"
    VISUAL_PRETEXT = "visual_pretext"
    IMAGE_PLANNING = "image_planning"
    STYLE_FIDELITY = "style_fidelity"
    SHARE_READY = "share_ready"


class LLMConfig(BaseModel):
    provider: str = Field(min_length=1)
    base_url: AnyHttpUrl
    # 允许第三方/本地 OpenAI 兼容服务不需要 API Key（可为空字符串）
    api_key: SecretStr
    model: str = Field(min_length=1)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2000, ge=128, le=16000)
    top_p: float = Field(default=1.0, gt=0.0, le=1.0)


class ImageConfig(BaseModel):
    enabled: bool = False
    provider: str | None = None
    base_url: AnyHttpUrl | None = None
    api_key: SecretStr | None = None
    model: str | None = None
    count: int = Field(default=1, ge=1, le=3)
    style_preset: str = ""
    custom_prompt: str = ""
    placement: ImagePlacement = ImagePlacement.HEADER
    smart_mode: bool = True
    smart_max_count: int = Field(default=3, ge=1, le=3)
    async_generation: bool = False
    retry_on_failure: bool = True
    retry_strategy: ImageRetryStrategy = ImageRetryStrategy.SIMPLIFY_PROMPT
    fallback_model: str | None = None

    @model_validator(mode="after")
    def validate_enabled_payload(self) -> "ImageConfig":
        if not self.enabled:
            return self
        required_fields = {
            "provider": self.provider,
            "base_url": self.base_url,
            "model": self.model,
        }
        missing = [key for key, value in required_fields.items() if value in (None, "")]
        if missing:
            raise ValueError(f"插图生成已启用，但缺少字段: {', '.join(missing)}")

        if self.retry_on_failure and self.retry_strategy is ImageRetryStrategy.FALLBACK_MODEL:
            if not (self.fallback_model or "").strip():
                raise ValueError("插图失败重试策略为 fallback_model，但未提供 fallback_model。")
        return self


class ImageEstimateConfig(BaseModel):
    enabled: bool = False
    count: int = Field(default=1, ge=1, le=3)
    placement: ImagePlacement = ImagePlacement.HEADER


class CacheOptions(BaseModel):
    enabled: bool = False


class FunctionSkill(BaseModel):
    id: FunctionSkillId
    label: str = Field(min_length=1, max_length=64)
    instruction: str = Field(min_length=1, max_length=400)


class StyleProfile(BaseModel):
    name: str = Field(min_length=1)
    audience: str = ""
    tone: str = ""
    structure_template: str = ""
    emphasis_points: list[str] = Field(default_factory=list)
    citation_policy: StyleCitationPolicy = StyleCitationPolicy.AUTO
    title_policy: StyleTitlePolicy = StyleTitlePolicy.RETAIN
    image_focus: StyleImageFocus = StyleImageFocus.AUTO
    layout_format: StyleLayoutFormat = StyleLayoutFormat.AUTO
    visual_mode: StyleVisualMode = StyleVisualMode.AUTO
    function_skills: list[FunctionSkill] = Field(default_factory=list)


class StyleProfileSuggestion(BaseModel):
    audience: str = ""
    tone: str = ""
    structure_template: str = ""
    emphasis_points: list[str] = Field(default_factory=list)
    citation_policy: StyleCitationPolicy = StyleCitationPolicy.AUTO
    title_policy: StyleTitlePolicy = StyleTitlePolicy.RETAIN
    image_focus: StyleImageFocus = StyleImageFocus.AUTO
    layout_format: StyleLayoutFormat = StyleLayoutFormat.AUTO
    visual_mode: StyleVisualMode = StyleVisualMode.AUTO


class StylePromptMemoryHint(BaseModel):
    target: "StylePromptTarget"
    prompt_excerpt: str = ""
    optimized_prompt: str = ""
    profile_suggestion: StyleProfileSuggestion
    source_style_name: str = ""
    accepted_at: datetime | None = None
    usage_count: int = Field(default=1, ge=1)


class TransformRequest(BaseModel):
    input_type: InputType
    input: str = Field(min_length=1)
    style_prompt: str = Field(min_length=1)
    style_profile: StyleProfile | None = None
    llm: LLMConfig
    image: ImageConfig = Field(default_factory=ImageConfig)
    cache: CacheOptions = Field(default_factory=CacheOptions)

    @field_validator("input")
    @classmethod
    def validate_input_length(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("输入内容不能为空。")
        return stripped

    @field_validator("input_type")
    @classmethod
    def validate_input_type(cls, value: InputType) -> InputType:
        if value is InputType.DISCOVER:
            raise ValueError("transform 接口仅支持 url 或 text 输入。")
        return value


class ProviderTestRequest(BaseModel):
    llm: LLMConfig


class SourceContent(BaseModel):
    title: str
    source_url: str | None = None
    raw_excerpt: str
    full_text: str


class GeneratedImage(BaseModel):
    id: str
    url: str
    prompt: str


class TransformMeta(BaseModel):
    input_type: InputType
    provider: str
    model: str
    duration_ms: int
    used_cache: bool = False


class TransformResponse(BaseModel):
    request_id: str
    title: str
    source_url: str | None = None
    raw_excerpt: str
    transformed_text: str
    images: list[GeneratedImage] = Field(default_factory=list)
    image_prompts: list[str] | None = None
    meta: TransformMeta
    run: WorkflowRun | None = None


class ProviderTestResponse(BaseModel):
    ok: bool
    provider: str
    model: str
    message: str


class ImageRegenerateRequest(BaseModel):
    image_id: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    image: ImageConfig


class CostPricing(BaseModel):
    prompt_usd_per_1k: float = Field(gt=0)
    completion_usd_per_1k: float = Field(gt=0)
    image_usd_each: float | None = Field(default=None, ge=0)


class CostEstimateRequest(BaseModel):
    input_type: InputType
    input: str = Field(min_length=1)
    style_prompt: str = Field(min_length=1)
    style_profile: StyleProfile | None = None
    llm: LLMConfig
    image: ImageEstimateConfig = Field(default_factory=ImageEstimateConfig)
    cache: CacheOptions = Field(default_factory=CacheOptions)
    pricing: CostPricing | None = None

    @field_validator("input_type")
    @classmethod
    def validate_input_type(cls, value: InputType) -> InputType:
        if value is InputType.DISCOVER:
            raise ValueError("费用估算接口仅支持 url 或 text 输入。")
        return value


class CostEstimateCostUSD(BaseModel):
    prompt: float
    completion_max: float
    images: float
    total_max: float


class CostEstimateChunking(BaseModel):
    enabled: bool
    chunks: int
    rewrite_calls: int
    merge_calls: int


class CostEstimateImages(BaseModel):
    enabled: bool
    calls: int


class CostEstimateResponse(BaseModel):
    prompt_tokens: int
    completion_tokens_max: int
    total_tokens_max: int
    chunking: CostEstimateChunking
    images: CostEstimateImages
    cost_usd: CostEstimateCostUSD | None = None
    notes: list[str] = Field(default_factory=list)


class SearchSource(BaseModel):
    id: int = Field(ge=1)
    title: str
    url: AnyHttpUrl
    snippet: str = ""
    excerpt: str = ""
    source_type: str = "article"
    relevance_score: float = Field(default=0.0, ge=0.0)
    credibility_score: float = Field(default=0.0, ge=0.0, le=10.0)
    overall_score: float = Field(default=0.0, ge=0.0, le=10.0)
    capture_mode: str = "full"


class DiscoverMeta(BaseModel):
    provider: str
    model: str
    duration_ms: int
    used_cache: bool = False
    followup_used: bool = False
    sources: int = Field(ge=0)
    evidence_items: int = Field(default=0, ge=0)
    uncertainties: int = Field(default=0, ge=0)
    resumed: bool = False
    resume_stage: str | None = None


class DiscoverRequest(BaseModel):
    query: str = Field(min_length=1)
    style_prompt: str = Field(min_length=1)
    style_profile: StyleProfile | None = None
    llm: LLMConfig
    cache: CacheOptions = Field(default_factory=CacheOptions)
    resume: "DiscoverResumeOptions | None" = None

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("关键词不能为空。")
        return stripped


class DiscoverEvidenceItem(BaseModel):
    source_id: int = Field(ge=1)
    title: str
    url: AnyHttpUrl
    quote: str = ""
    evidence: str = ""
    relevance: str = ""


class DiscoverBrief(BaseModel):
    summary: str = ""
    conclusion: str = ""
    key_findings: list[str] = Field(default_factory=list)
    evidence: list[DiscoverEvidenceItem] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    draft_outline: list[str] = Field(default_factory=list)


class DiscoverResumeStage(str, Enum):
    SOURCES = "sources"
    BRIEF = "brief"
    DRAFT = "draft"


class DiscoverResumeOptions(BaseModel):
    run_id: str = Field(min_length=8, max_length=64)
    stage: DiscoverResumeStage = DiscoverResumeStage.BRIEF


class DiscoverResponse(BaseModel):
    request_id: str
    title: str
    transformed_text: str
    brief: DiscoverBrief
    sources: list[SearchSource] = Field(default_factory=list)
    meta: DiscoverMeta
    run: WorkflowRun | None = None


class WorkflowArtifact(BaseModel):
    id: str
    kind: ArtifactKind
    label: str
    path: str
    mime_type: str
    size_bytes: int = Field(ge=0)
    preview: str = ""
    created_at: datetime


class WorkflowStep(BaseModel):
    id: str
    label: str
    status: WorkflowStepStatus
    started_at: datetime
    finished_at: datetime
    duration_ms: int = Field(ge=0)
    detail: str = ""


class WorkflowRun(BaseModel):
    id: str
    mode: WorkflowRunMode
    status: WorkflowRunStatus
    workspace_path: str
    started_at: datetime
    finished_at: datetime
    duration_ms: int = Field(ge=0)
    title: str = ""
    summary: str = ""
    steps: list[WorkflowStep] = Field(default_factory=list)
    artifacts: list[WorkflowArtifact] = Field(default_factory=list)


class StylePromptTarget(str, Enum):
    REWRITE = "rewrite"
    DISCOVER = "discover"


class StylePromptOptimizeRequest(BaseModel):
    prompt: str = Field(min_length=1)
    target: StylePromptTarget = StylePromptTarget.REWRITE
    llm: LLMConfig
    current_profile: StyleProfileSuggestion | None = None
    memory_hints: list[StylePromptMemoryHint] = Field(default_factory=list)


class StylePromptOptimizeResponse(BaseModel):
    optimized_prompt: str
    notes: list[str] = Field(default_factory=list)
    profile_suggestion: StyleProfileSuggestion | None = None


TransformResponse.model_rebuild()
DiscoverResponse.model_rebuild()
