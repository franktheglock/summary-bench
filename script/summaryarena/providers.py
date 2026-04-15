"""Unified LLM provider interface via LiteLLM."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

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
    quantization: str | None = None


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


def _extract_text_from_content_parts(content: Any) -> str:
    """Extract final output text from content blocks.

    Supports both chat-completions style message content lists and Responses API
    content arrays where final answer text appears in `output_text` blocks.
    """
    if isinstance(content, str):
        return content.strip()

    if not isinstance(content, list):
        return ""

    parts: list[str] = []
    for item in content:
        if isinstance(item, dict):
            item_type = item.get("type")
            if item_type in {"text", "output_text"}:
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
        else:
            item_type = getattr(item, "type", None)
            if item_type in {"text", "output_text"}:
                text = getattr(item, "text", None)
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())

    return "\n".join(parts).strip()


def extract_final_text(response: Any) -> str:
    """Extract final answer text without falling back to reasoning text.

    Priority:
    1. Chat completions `choices[0].message.content`
    2. Responses API `output[].content[]` blocks with `type == output_text`
    3. Empty string if only reasoning is present
    """
    choices = getattr(response, "choices", None) or []
    if choices:
        message = getattr(choices[0], "message", None)
        if message is not None:
            text = _extract_text_from_content_parts(getattr(message, "content", None))
            if text:
                return text

    output = getattr(response, "output", None) or []
    for item in output:
        item_type = item.get("type") if isinstance(item, dict) else getattr(item, "type", None)
        if item_type != "message":
            continue

        content = item.get("content") if isinstance(item, dict) else getattr(item, "content", None)
        text = _extract_text_from_content_parts(content)
        if text:
            return text

    return ""


def extract_reasoning_fallback_text(response: Any) -> str:
    """Extract a usable final answer from reasoning content when available.

    Some local OpenAI-compatible servers expose the model's full visible output in
    `reasoning_content`, with `<think>...</think>` wrapping the private chain of
    thought and the final answer appended afterward. In that case, stripping the
    thinking block yields the real answer text.

    If reasoning content contains only chain-of-thought, `strip_thinking_text`
    will return an empty string and this function safely yields nothing.
    """
    choices = getattr(response, "choices", None) or []
    if not choices:
        return ""

    message = getattr(choices[0], "message", None)
    if message is None:
        return ""

    reasoning_content = getattr(message, "reasoning_content", None) or ""
    if not isinstance(reasoning_content, str) or not reasoning_content.strip():
        return ""

    return strip_thinking_text(reasoning_content)


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
        self.quantization: str | None = None

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

    def refresh_model_metadata(self) -> None:
        """Refresh provider-specific metadata when the backend exposes it."""
        if self.provider != "lm_studio":
            return

        try:
            self.quantization = self._fetch_lm_studio_quantization()
        except Exception as exc:
            logger.debug("Unable to fetch LM Studio model metadata: %s", exc)
            self.quantization = None

    def _lm_studio_rest_base_url(self) -> str | None:
        """Convert an OpenAI-compatible base URL into the LM Studio REST API base."""
        if not self.base_url:
            return None

        base_url = self.base_url.rstrip("/")
        if base_url.endswith("/api/v1"):
            return base_url
        if base_url.endswith("/v1"):
            return f"{base_url.removesuffix('/v1')}/api/v1"
        return f"{base_url}/api/v1"

    def _fetch_lm_studio_quantization(self) -> str | None:
        """Fetch quantization metadata from LM Studio's native REST API."""
        rest_base_url = self._lm_studio_rest_base_url()
        if not rest_base_url:
            return None

        endpoints = [
            f"{rest_base_url}/models/{self.model}",
            f"{rest_base_url}/models",
        ]

        for endpoint in endpoints:
            try:
                request = Request(endpoint)
                if self.api_key:
                    request.add_header("Authorization", f"Bearer {self.api_key}")

                with urlopen(request, timeout=5) as response:
                    payload = json.loads(response.read().decode("utf-8"))
            except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
                continue

            quantization = self._extract_quantization_from_lm_studio_payload(payload)
            if quantization:
                return quantization

        return None

    def _extract_quantization_from_lm_studio_payload(self, payload: Any) -> str | None:
        """Extract a quantization string from LM Studio REST payloads."""
        if not isinstance(payload, dict):
            return None

        for key in ("quantization", "quant"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        model_info = payload.get("model_info")
        if isinstance(model_info, dict):
            for key in ("quantization", "quant"):
                value = model_info.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()

        models = payload.get("data")
        if isinstance(models, list):
            for model in models:
                if not isinstance(model, dict):
                    continue
                model_id = model.get("id")
                if model_id in {self.model, self.litellm_model, self.model.split("/")[-1]}:
                    quantization = self._extract_quantization_from_lm_studio_payload(model)
                    if quantization:
                        return quantization

        return None

    def generate_summary(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None = None,
    ) -> GenerationResult:
        """Generate a summary using the configured provider.

        Args:
            system_prompt: System-level instruction for the model.
            user_prompt: User prompt containing the text to summarize.
            max_tokens: Optional maximum tokens in the response. If omitted,
                the provider decides the generation limit.

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
        }

        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens

        if self.base_url:
            kwargs["api_base"] = self.base_url
        if self.api_key:
            kwargs["api_key"] = self.api_key

        start = time.perf_counter_ns()
        response = litellm.completion(**kwargs)
        elapsed_ms = (time.perf_counter_ns() - start) // 1_000_000

        # Extract usage info
        usage = response.usage
        text = extract_final_text(response)

        if not text:
            text = extract_reasoning_fallback_text(response)

        # Strip thinking/reasoning text before saving
        text = strip_thinking_text(text)

        return GenerationResult(
            text=text,
            input_tokens=usage.prompt_tokens if usage else 0,
            output_tokens=usage.completion_tokens if usage else 0,
            latency_ms=elapsed_ms,
            quantization=self.quantization,
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
