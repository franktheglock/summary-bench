"""Configuration management for Summary Arena."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field

from summaryarena.models import VALID_CATEGORIES

logger = logging.getLogger(__name__)

# Default config directory
CONFIG_DIR = Path.home() / ".summaryarena"
CONFIG_FILE = CONFIG_DIR / "config.yaml"
CACHE_DIR = CONFIG_DIR / "cache"


class SummaryArenaConfig(BaseModel):
    """User configuration for Summary Arena CLI."""

    provider: str = Field("ollama", description="Default inference provider")
    model: str = Field("llama3.1", description="Default model name")
    base_url: str | None = Field(None, description="Custom API base URL")
    api_key: str | None = Field(None, description="API key (if required)")
    temperature: float = Field(0.0, ge=0.0, le=2.0)
    categories: list[str] = Field(
        default_factory=lambda: list(VALID_CATEGORIES),
        description="Default categories to benchmark",
    )
    output_dir: str = Field(".", description="Default output directory")
    auto_metrics: bool = Field(False, description="Compute ROUGE-L and BERTScore (requires extras)")
    parallel_requests: int = Field(
        1,
        ge=1,
        le=16,
        description="Concurrent requests to issue per benchmark run",
    )
    dataset_version: str = Field("v1", description="Dataset version to use")

    @classmethod
    def load(cls, path: Path | None = None) -> SummaryArenaConfig:
        """Load config from YAML file, falling back to defaults."""
        config_path = path or CONFIG_FILE
        if config_path.exists():
            logger.info("Loading config from %s", config_path)
            with open(config_path, encoding="utf-8") as f:
                data: dict[str, Any] = yaml.safe_load(f) or {}
            return cls(**data)
        logger.info("No config found at %s, using defaults", config_path)
        return cls()

    def save(self, path: Path | None = None) -> Path:
        """Save config to YAML file."""
        config_path = path or CONFIG_FILE
        config_path.parent.mkdir(parents=True, exist_ok=True)

        data = self.model_dump(exclude_none=True)
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)

        logger.info("Config saved to %s", config_path)
        return config_path


def ensure_cache_dir() -> Path:
    """Ensure the cache directory exists and return its path."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR
