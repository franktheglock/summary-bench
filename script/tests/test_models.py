"""Tests for Pydantic models and schema validation."""

import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from summaryarena.models import (
    AutoMetrics,
    BenchmarkResult,
    PromptTemplate,
    RunConfig,
    TestCase,
    TestResult,
    VALID_CATEGORIES,
)
from summaryarena.prompts import clear_cache, load_prompt_templates


class TestAutoMetrics:
    """Tests for AutoMetrics model."""

    def test_valid_metrics(self):
        m = AutoMetrics(rouge_l=0.42, bert_score_f1=0.85)
        assert m.rouge_l == 0.42
        assert m.bert_score_f1 == 0.85

    def test_none_metrics(self):
        m = AutoMetrics()
        assert m.rouge_l is None
        assert m.bert_score_f1 is None

    def test_boundary_values(self):
        m = AutoMetrics(rouge_l=0.0, bert_score_f1=1.0)
        assert m.rouge_l == 0.0
        assert m.bert_score_f1 == 1.0

    def test_out_of_range(self):
        with pytest.raises(Exception):
            AutoMetrics(rouge_l=1.5)
        with pytest.raises(Exception):
            AutoMetrics(bert_score_f1=-0.1)


class TestTestResult:
    """Tests for TestResult model."""

    def test_valid_result(self):
        r = TestResult(
            test_id="news-cnn-001",
            category="news",
            summary="This is a test summary.",
            input_tokens=100,
            output_tokens=20,
            latency_ms=500,
        )
        assert r.test_id == "news-cnn-001"
        assert r.category == "news"
        assert r.auto_metrics is None

    def test_result_with_metrics(self):
        r = TestResult(
            test_id="code-py-001",
            category="code",
            summary="Code summary.",
            input_tokens=200,
            output_tokens=30,
            latency_ms=1000,
            auto_metrics=AutoMetrics(rouge_l=0.5),
        )
        assert r.auto_metrics.rouge_l == 0.5

    def test_negative_tokens_rejected(self):
        with pytest.raises(Exception):
            TestResult(
                test_id="test",
                category="news",
                summary="s",
                input_tokens=-1,
                output_tokens=10,
                latency_ms=100,
            )


class TestRunConfig:
    """Tests for RunConfig model."""

    def test_valid_config(self):
        c = RunConfig(
            provider="ollama",
            model="llama3.1",
            temperature=0.0,
            categories=["news", "code"],
        )
        assert c.provider == "ollama"
        assert c.benchmark_version == "v1"

    def test_temperature_range(self):
        with pytest.raises(Exception):
            RunConfig(
                provider="test",
                model="test",
                temperature=3.0,
                categories=["news"],
            )


class TestBenchmarkResult:
    """Tests for BenchmarkResult (top-level output schema)."""

    @pytest.fixture
    def sample_result(self) -> BenchmarkResult:
        return BenchmarkResult(
            benchmark_version="1.0",
            run_id=str(uuid4()),
            model="llama3.1",
            provider="ollama",
            timestamp=datetime.now(timezone.utc),
            config=RunConfig(
                provider="ollama",
                model="llama3.1",
                temperature=0.0,
                categories=["news"],
            ),
            results=[
                TestResult(
                    test_id="news-cnn-001",
                    category="news",
                    summary="Test summary one.",
                    input_tokens=100,
                    output_tokens=20,
                    latency_ms=500,
                ),
                TestResult(
                    test_id="news-cnn-002",
                    category="news",
                    summary="Test summary two.",
                    input_tokens=150,
                    output_tokens=25,
                    latency_ms=600,
                ),
            ],
        )

    def test_valid_result(self, sample_result: BenchmarkResult):
        assert len(sample_result.results) == 2
        assert sample_result.provider == "ollama"

    def test_summary_stats(self, sample_result: BenchmarkResult):
        stats = sample_result.summary_stats()
        assert stats["total_tests"] == 2
        assert stats["total_input_tokens"] == 250
        assert stats["total_output_tokens"] == 45
        assert stats["total_latency_ms"] == 1100
        assert "news" in stats["categories"]

    def test_round_trip_json(self, sample_result: BenchmarkResult):
        """Serialize to JSON and deserialize back — should be lossless."""
        json_str = sample_result.model_dump_json()
        parsed = json.loads(json_str)
        restored = BenchmarkResult(**parsed)

        assert restored.run_id == sample_result.run_id
        assert restored.model == sample_result.model
        assert len(restored.results) == len(sample_result.results)
        assert restored.results[0].test_id == sample_result.results[0].test_id

    def test_json_file_round_trip(self, sample_result: BenchmarkResult, tmp_path):
        """Write to file and read back."""
        path = tmp_path / "results.json"
        with open(path, "w") as f:
            json.dump(sample_result.model_dump(mode="json"), f, default=str)

        with open(path) as f:
            data = json.load(f)

        restored = BenchmarkResult(**data)
        assert restored.run_id == sample_result.run_id


class TestTestCase:
    """Tests for TestCase model."""

    def test_valid_case(self):
        tc = TestCase(
            test_id="news-cnn-001",
            category="news",
            input_text="Some article text.",
            gold_summary="A summary.",
            context_length_tokens=100,
            source="cnn_dailymail/3.0.0",
            prompt_template_key="news",
        )
        assert tc.test_id == "news-cnn-001"

    def test_no_gold_summary(self):
        tc = TestCase(
            test_id="test-001",
            category="code",
            input_text="def foo(): pass",
            context_length_tokens=10,
            prompt_template_key="code",
        )
        assert tc.gold_summary is None


class TestPromptTemplate:
    """Tests for PromptTemplate model."""

    def test_valid_template(self):
        t = PromptTemplate(
            system="You are a helpful assistant.",
            user="Summarize: {input_text}",
        )
        assert "{input_text}" in t.user


class TestValidCategories:
    """Test the VALID_CATEGORIES constant."""

    def test_has_all_categories(self):
        expected = {"news", "code", "agentic", "meeting", "legal", "scientific", "reviews"}
        assert set(VALID_CATEGORIES) == expected

    def test_order_preserved(self):
        assert VALID_CATEGORIES[0] == "news"


class TestPromptTemplates:
    """Tests for the prompt template text."""

    def test_templates_are_not_roleplay_framed(self):
        clear_cache()
        templates = load_prompt_templates()

        for name, template in templates.items():
            assert not template.system.lstrip().startswith("You are"), name

    def test_news_prompt_is_shorter(self):
        clear_cache()
        templates = load_prompt_templates()

        news_user = templates["news"].user
        assert "1-2 sentences" in news_user
        assert "2-4 sentences" not in news_user
