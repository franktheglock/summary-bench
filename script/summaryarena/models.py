"""Pydantic models for Summary Arena schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class AutoMetrics(BaseModel):
    """Optional auto-computed metrics for a summary."""

    rouge_l: float | None = Field(None, ge=0.0, le=1.0, description="ROUGE-L F1 score")
    bert_score_f1: float | None = Field(
        None, ge=0.0, le=1.0, description="BERTScore F1"
    )


class TestResult(BaseModel):
    """Result for a single test case."""

    test_id: str = Field(..., description="Unique test case ID (e.g. 'news-cnn-001')")
    category: str = Field(..., description="Category of the test case")
    summary: str = Field(..., description="Generated summary text")
    prompt_used: str | None = Field(None, description="Full prompt sent to the model")
    input_tokens: int = Field(..., ge=0, description="Input token count")
    output_tokens: int = Field(..., ge=0, description="Output token count")
    latency_ms: int = Field(..., ge=0, description="Generation latency in milliseconds")
    auto_metrics: AutoMetrics | None = Field(None, description="Optional auto-metrics")


class RunConfig(BaseModel):
    """Configuration snapshot for a benchmark run."""

    provider: str = Field(..., description="Provider name (e.g. 'ollama', 'openrouter')")
    model: str = Field(..., description="Model identifier")
    base_url: str | None = Field(None, description="Custom API base URL")
    temperature: float = Field(0.0, ge=0.0, le=2.0)
    categories: list[str] = Field(..., description="Categories benchmarked")
    benchmark_version: str = Field("v1", description="Dataset version used")


class BenchmarkResult(BaseModel):
    """Top-level schema for a benchmark run output file (results-v1.json)."""

    benchmark_version: str = Field("1.0", description="Schema version")
    run_id: str = Field(..., description="Unique run identifier (UUID)")
    model: str = Field(..., description="Model identifier")
    provider: str = Field(..., description="Provider name")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Run timestamp (UTC)"
    )
    config: RunConfig = Field(..., description="Full config used for the run")
    results: list[TestResult] = Field(..., description="Per-test-case results")

    def summary_stats(self) -> dict[str, Any]:
        """Compute aggregate statistics for the run."""
        total_input = sum(r.input_tokens for r in self.results)
        total_output = sum(r.output_tokens for r in self.results)
        total_latency = sum(r.latency_ms for r in self.results)
        categories = list({r.category for r in self.results})

        return {
            "total_tests": len(self.results),
            "categories": sorted(categories),
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_latency_ms": total_latency,
            "avg_latency_ms": total_latency // max(len(self.results), 1),
        }


class TestCase(BaseModel):
    """Schema for a single test case in the dataset."""

    test_id: str = Field(..., description="Unique test case ID")
    category: str = Field(..., description="Category (news, code, agentic, ...)")
    input_text: str = Field(..., description="Full input text to summarize")
    gold_summary: str | None = Field(None, description="Reference summary (if available)")
    context_length_tokens: int = Field(..., ge=0, description="Approximate token count of input")
    source: str = Field("", description="Data source (e.g. 'cnn_dailymail/3.0.0')")
    prompt_template_key: str = Field(..., description="Key into prompt_templates.yaml")


class PromptTemplate(BaseModel):
    """A category-specific prompt template."""

    system: str = Field(..., description="System prompt")
    user: str = Field(..., description="User prompt template (use {input_text} placeholder)")


# Valid categories
VALID_CATEGORIES: list[str] = [
    "news",
    "code",
    "agentic",
    "meeting",
    "legal",
    "scientific",
    "reviews",
]
