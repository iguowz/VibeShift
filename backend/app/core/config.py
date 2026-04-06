from pathlib import Path
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VIBESHIFT_", case_sensitive=False)

    app_env: str = "development"
    request_timeout_seconds: float = 180.0
    local_llm_request_timeout_seconds: float = 420.0
    fetch_timeout_seconds: float = 15.0
    cache_ttl_seconds: int = 3600
    cache_max_entries: int = 256
    searxng_url: str | None = None
    searxng_timeout_seconds: float = 15.0
    searxng_engines: str | None = "baidu,github"
    searxng_forwarded_ip: str = "127.0.0.1"
    discover_max_results: int = 8
    discover_fetch_top_k: int = 5
    discover_followup_enabled: bool = True
    discover_cache_ttl_seconds: int = 3600
    discover_cache_max_entries: int = 128
    max_input_characters: int = 50000
    max_url_inputs: int = 8
    rewrite_chunk_size_characters: int = 6000
    rewrite_chunk_overlap_characters: int = 500
    rewrite_max_concurrency: int = 3
    rewrite_min_chunk_size_characters: int = 1800
    runs_directory: str = str(Path(".runs"))
    artifact_preview_characters: int = 1600
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])
    user_agent: str = "VibeShiftBot/0.1 (+https://example.local)"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
