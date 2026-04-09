"""Unified LLM provider interface via LiteLLM."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import litellm

logger = logging.getLogger(__name__)

# Suppress LiteLLM's verbose logging
litellm.suppress_debug_info = True

# Provider → LiteLLM model prefix mapping
PROVIDER_PREFIXES: dict[str, str] = {
    "openrouter": "openrouter/",
    "ollama": "ollama/",
    "lm_studio": "lm_studio/",
    "vllm": "hosted_vllm/",
    "groq": "groq/",
    "together_ai": "together_ai/",
    "nvidia_nim": "nvidia_nim/",
    "openai": "",  # OpenAI models don't need a prefix
}

# Default base URLs for local providers
DEFAULT_BASE_URLS: dict[str, str] = {
    "ollama": "http://localhost:11434",
    "lm_studio": "http://localhost:1234/v1",
    "vllm": "http://localhost:8000/v1",
}


@dataclass
class GenerationResult:
    """Result from a single LLM generation call."""

    text: str
    input_tokens: int
    output_tokens: int
    latency_ms: int


def strip_thinking_text(text: str) -> str:
    """Strip reasoning/thinking blocks from model output.

    Removes common thinking tag patterns like:
    - <think>...</think>
    - <thinking>...</thinking>
    - <reasoning>...</reasoning>
    - ### Thinking: ... sections
    """
    import re

    if not text:
        return text

    # Pattern 1: XML-style thinking tags
    patterns = [
        r"<think>.*?</think>",  # DeepSeek, QwQ style
        r"<thinking>.*?</thinking>",
        r"<reasoning>.*?</reasoning>",
        r"<thought>.*?</thought>",
    ]

    cleaned = text
    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.DOTALL | re.IGNORECASE)

    # Pattern 2: Markdown-style thinking sections
    section_patterns = [
        r"###\s*Thinking:?\s*\n.*?\n###",
        r"###\s*Reasoning:?\s*\n.*?\n###",
        r"---\s*thinking\s*---.*?---",
    ]

    for pattern in section_patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.DOTALL | re.IGNORECASE)

    return cleaned.strip()


class SummaryProvider:
    """Unified interface for generating summaries via any LiteLLM-supported provider."""

    def __init__(
        self,
        provider: str,
        model: str,
        base_url: str | None = None,
        api_key: str | None = None,
        temperature: float = 0.0,
    ) -> None:
        self.provider = provider.lower()
        self.model = model
        self.temperature = temperature
        self.api_key = api_key

        # Build the full LiteLLM model string
        prefix = PROVIDER_PREFIXES.get(self.provider, "")
        self.litellm_model = f"{prefix}{model}"

        # Resolve base URL
        self.base_url = base_url or DEFAULT_BASE_URLS.get(self.provider)

        logger.info(
            "Provider initialized: %s (litellm_model=%s, base_url=%s)",
            self.provider,
            self.litellm_model,
            self.base_url,
        )

    def generate_summary(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 1024,
    ) -> GenerationResult:
        """Generate a summary using the configured provider.

        Args:
            system_prompt: System-level instruction for the model.
            user_prompt: User prompt containing the text to summarize.
            max_tokens: Maximum tokens in the response.

        Returns:
            GenerationResult with text, token counts, and latency.

        Raises:
            Exception: If the LiteLLM call fails after retries.
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        kwargs: dict = {
            "model": self.litellm_model,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": max_tokens,
        }

        if self.base_url:
            kwargs["api_base"] = self.base_url
        if self.api_key:
            kwargs["api_key"] = self.api_key

        start = time.perf_counter_ns()
        response = litellm.completion(**kwargs)
        elapsed_ms = (time.perf_counter_ns() - start) // 1_000_000

        # Extract usage info
        usage = response.usage
        message = response.choices[0].message
        text = (getattr(message, "content", None) or "").strip()

        if not text:
            reasoning_content = getattr(message, "reasoning_content", None) or ""
            text = reasoning_content.strip()

        # Strip thinking/reasoning text before saving
        text = strip_thinking_text(text)

        return GenerationResult(
            text=text,
            input_tokens=usage.prompt_tokens if usage else 0,
            output_tokens=usage.completion_tokens if usage else 0,
            latency_ms=elapsed_ms,
        )

    def test_connection(self) -> bool:
        """Test if the provider is reachable with a simple prompt.

        Some reasoning models return an empty final `content` field and place
        their visible output in `reasoning_content`. For reachability, any
        successful completion counts as alive.
        """
        try:
            messages = [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "Say 'ok' and nothing else."},
            ]

            kwargs: dict = {
                "model": self.litellm_model,
                "messages": messages,
                "temperature": self.temperature,
                "max_tokens": 10,
            }

            if self.base_url:
                kwargs["api_base"] = self.base_url
            if self.api_key:
                kwargs["api_key"] = self.api_key

            response = litellm.completion(**kwargs)
            message = response.choices[0].message
            content = getattr(message, "content", None) or ""
            reasoning_content = getattr(message, "reasoning_content", None) or ""
            return bool(content.strip() or reasoning_content.strip() or response.choices)
        except Exception as e:
            logger.error("Connection test failed: %s", e)
            return False
