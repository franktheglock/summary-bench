"""Prompt template management for Summary Arena."""

from __future__ import annotations

import logging
from pathlib import Path

import yaml

from summaryarena.models import PromptTemplate

logger = logging.getLogger(__name__)

_PACKAGE_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _PACKAGE_DIR.parent.parent
_DATASETS_DIR = _REPO_ROOT / "datasets"

# Cache loaded templates
_templates_cache: dict[str, PromptTemplate] | None = None


def load_prompt_templates(
    version: str = "v1",
    datasets_dir: Path | None = None,
) -> dict[str, PromptTemplate]:
    """Load prompt templates from the YAML file.

    Args:
        version: Dataset version to load templates for.
        datasets_dir: Override the datasets directory path.

    Returns:
        Dict mapping category/template key to PromptTemplate.
    """
    global _templates_cache

    if _templates_cache is not None:
        return _templates_cache

    base_dir = datasets_dir or (_DATASETS_DIR / version)
    templates_path = base_dir / "prompt_templates.yaml"

    if not templates_path.exists():
        raise FileNotFoundError(
            f"Prompt templates not found at {templates_path}. "
            f"Ensure the datasets directory is properly set up."
        )

    with open(templates_path, encoding="utf-8") as f:
        raw: dict[str, dict[str, str]] = yaml.safe_load(f)

    _templates_cache = {
        key: PromptTemplate(**tmpl) for key, tmpl in raw.items()
    }

    logger.info("Loaded %d prompt templates from %s", len(_templates_cache), templates_path)
    return _templates_cache


def get_prompt(
    template_key: str,
    input_text: str,
    version: str = "v1",
) -> tuple[str, str]:
    """Build the system and user prompts for a given template key and input.

    Args:
        template_key: The prompt_template_key from the test case.
        input_text: The full input text to embed in the prompt.
        version: Dataset version.

    Returns:
        Tuple of (system_prompt, user_prompt).

    Raises:
        KeyError: If the template key is not found.
    """
    templates = load_prompt_templates(version=version)

    if template_key not in templates:
        available = list(templates.keys())
        raise KeyError(
            f"Unknown prompt template key '{template_key}'. Available: {available}"
        )

    tmpl = templates[template_key]
    user_prompt = tmpl.user.replace("{input_text}", input_text)

    return tmpl.system, user_prompt


def clear_cache() -> None:
    """Clear the cached templates (useful for testing)."""
    global _templates_cache
    _templates_cache = None
