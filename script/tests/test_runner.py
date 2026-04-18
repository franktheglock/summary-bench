"""Tests for the benchmark runner with mocked LLM provider."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from summaryarena.config import SummaryArenaConfig
from summaryarena.models import TestCase, BenchmarkResult
from summaryarena.providers import GenerationResult, SummaryProvider
from summaryarena.runner import BenchmarkRunner


@pytest.fixture
def mock_provider() -> MagicMock:
    """Create a mock SummaryProvider that returns predictable results."""
    provider = MagicMock(spec=SummaryProvider)
    provider.test_connection.return_value = True
    provider.generate_summary.return_value = GenerationResult(
        text="This is a mock summary of the input text.",
        input_tokens=100,
        output_tokens=15,
        latency_ms=250,
    )
    return provider


@pytest.fixture
def sample_config() -> SummaryArenaConfig:
    """Create a sample config for testing."""
    return SummaryArenaConfig(
        provider="mock",
        model="mock-model",
        temperature=0.0,
        dataset_version="v1",
    )


@pytest.fixture
def sample_test_cases() -> list[TestCase]:
    """Create sample test cases for testing."""
    return [
        TestCase(
            test_id="test-001",
            category="news",
            input_text="This is a test news article about important events.",
            gold_summary="A test summary.",
            context_length_tokens=50,
            prompt_template_key="news",
        ),
        TestCase(
            test_id="test-002",
            category="code",
            input_text="def hello(): print('world')",
            context_length_tokens=20,
            prompt_template_key="code",
        ),
    ]


class TestBenchmarkRunner:
    """Tests for the BenchmarkRunner class."""

    def test_run_single_success(
        self, mock_provider: MagicMock, sample_config: SummaryArenaConfig, sample_test_cases
    ):
        """Test running a single test case successfully."""
        runner = BenchmarkRunner(
            provider=mock_provider,
            config=sample_config,
            categories=["news", "code"],
            auto_metrics=False,
        )

        # Mock the dataset loading to return our sample cases
        with patch("summaryarena.runner.load_test_cases", return_value=sample_test_cases):
            result = runner._run_single(sample_test_cases[0])

        assert result is not None
        assert result.test_id == "test-001"
        assert result.category == "news"
        assert result.summary == "This is a mock summary of the input text."
        assert result.input_tokens == 100
        assert result.output_tokens == 15
        assert result.latency_ms == 250

    def test_run_single_failure_returns_none(
        self, sample_config: SummaryArenaConfig, sample_test_cases
    ):
        """Test that a failing provider returns None after retries."""
        failing_provider = MagicMock(spec=SummaryProvider)
        failing_provider.generate_summary.side_effect = Exception("API Error")

        runner = BenchmarkRunner(
            provider=failing_provider,
            config=sample_config,
            auto_metrics=False,
        )

        # Patch retry delay to avoid slow tests
        with patch("summaryarena.runner.RETRY_DELAY_SECONDS", 0.001):
            result = runner._run_single(sample_test_cases[0])

        assert result is None
        assert failing_provider.generate_summary.call_count == 3  # MAX_RETRIES

    def test_full_run_output_schema(
        self,
        mock_provider: MagicMock,
        sample_config: SummaryArenaConfig,
        sample_test_cases,
        tmp_path: Path,
    ):
        """Test that a full run produces valid JSON output."""
        runner = BenchmarkRunner(
            provider=mock_provider,
            config=sample_config,
            categories=["news", "code"],
            auto_metrics=False,
        )

        output_path = tmp_path / "test_results.json"

        with patch("summaryarena.runner.load_test_cases", return_value=sample_test_cases):
            result = runner.run(output_path=output_path)

        # Check the result object
        assert isinstance(result, BenchmarkResult)
        assert len(result.results) == 2
        assert result.model == "mock-model"
        assert result.provider == "mock"
        assert result.quantization is None

        # Check the output file
        assert output_path.exists()
        with open(output_path) as f:
            data = json.load(f)

        # Validate the file can be parsed back
        parsed = BenchmarkResult(**data)
        assert parsed.run_id == result.run_id
        assert len(parsed.results) == 2

    def test_full_run_includes_lm_studio_quantization(
        self,
        mock_provider: MagicMock,
        sample_test_cases,
        tmp_path: Path,
    ):
        """Test that LM Studio quantization is included when available."""
        config = SummaryArenaConfig(
            provider="lm_studio",
            model="meta-llama-3.1-8b-instruct",
            temperature=0.0,
            dataset_version="v1",
        )
        mock_provider.quantization = "Q4_K_M"

        runner = BenchmarkRunner(
            provider=mock_provider,
            config=config,
            categories=["news", "code"],
            auto_metrics=False,
        )

        output_path = tmp_path / "lmstudio_results.json"

        with patch("summaryarena.runner.load_test_cases", return_value=sample_test_cases):
            result = runner.run(output_path=output_path)

        assert result.quantization == "Q4_K_M"
        assert result.config.quantization == "Q4_K_M"

        with open(output_path) as f:
            data = json.load(f)

        assert data["quantization"] == "Q4_K_M"
        assert data["config"]["quantization"] == "Q4_K_M"

    def test_run_retries_provider_connection(
        self,
        mock_provider: MagicMock,
        sample_config: SummaryArenaConfig,
        sample_test_cases,
        tmp_path: Path,
    ):
        """Test that the runner waits for a provider that is still warming up."""
        mock_provider.test_connection.side_effect = [False, False, True]

        runner = BenchmarkRunner(
            provider=mock_provider,
            config=sample_config,
            categories=["news", "code"],
            auto_metrics=False,
        )

        output_path = tmp_path / "retry_results.json"

        with patch("summaryarena.runner.load_test_cases", return_value=sample_test_cases), patch(
            "summaryarena.runner.CONNECTION_RETRY_DELAY_SECONDS", 0.001
        ):
            result = runner.run(output_path=output_path)

        assert result is not None
        assert mock_provider.test_connection.call_count == 3
        assert output_path.exists()

    def test_parallel_lm_studio_uses_configured_workers(
        self,
        mock_provider: MagicMock,
        sample_test_cases,
        tmp_path: Path,
    ):
        """Test that LM Studio runs test cases concurrently when configured."""
        config = SummaryArenaConfig(
            provider="lm_studio",
            model="test-model",
            temperature=0.0,
            dataset_version="v1",
            parallel_requests=4,
        )

        runner = BenchmarkRunner(
            provider=mock_provider,
            config=config,
            categories=["news", "code"],
            auto_metrics=False,
        )

        output_path = tmp_path / "parallel_results.json"
        captured_workers: list[int] = []

        class FakeFuture:
            def __init__(self, value):
                self._value = value

            def result(self):
                return self._value

        class FakeExecutor:
            def __init__(self, max_workers):
                captured_workers.append(max_workers)

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def submit(self, fn, *args, **kwargs):
                return FakeFuture(fn(*args, **kwargs))

        with patch("summaryarena.runner.load_test_cases", return_value=sample_test_cases), patch(
            "summaryarena.runner.CONNECTION_RETRY_DELAY_SECONDS", 0.001
        ), patch("summaryarena.runner.ThreadPoolExecutor", FakeExecutor), patch(
            "summaryarena.runner.as_completed", lambda futures: futures
        ):
            result = runner.run(output_path=output_path)

        assert result is not None
        assert captured_workers == [4]
        assert len(result.results) == 2
        assert output_path.exists()

    def test_write_results(
        self,
        mock_provider: MagicMock,
        sample_config: SummaryArenaConfig,
        tmp_path: Path,
    ):
        """Test that results are written to the correct path."""
        runner = BenchmarkRunner(
            provider=mock_provider,
            config=sample_config,
        )

        # Create a minimal result
        result = BenchmarkResult(
            run_id=runner.run_id,
            model="test",
            provider="test",
            config=sample_config.model_dump() | {"categories": ["news"], "benchmark_version": "v1"},
            results=[],
        )

        output_path = tmp_path / "subdir" / "results.json"
        runner._write_results(result, output_path)

        assert output_path.exists()
        with open(output_path) as f:
            data = json.load(f)
        assert data["run_id"] == runner.run_id


class TestProviderMapping:
    """Test that provider name → LiteLLM prefix mapping works."""

    def test_ollama_prefix(self):
        p = SummaryProvider(provider="ollama", model="llama3.1")
        assert p.litellm_model == "ollama/llama3.1"

    def test_openrouter_prefix(self):
        p = SummaryProvider(provider="openrouter", model="meta-llama/llama-3.1-70b")
        assert p.litellm_model == "openrouter/meta-llama/llama-3.1-70b"

    def test_openrouter_requests_full_precision_quantizations(self):
        p = SummaryProvider(provider="openrouter", model="meta-llama/llama-3.1-70b")

        class _Message:
            content = "ok"
            reasoning_content = ""

        class _Choice:
            message = _Message()

        class _Usage:
            prompt_tokens = 1
            completion_tokens = 1

        class _Response:
            choices = [_Choice()]
            usage = _Usage()

        with patch("summaryarena.providers.litellm.completion", return_value=_Response()) as completion:
            p.generate_summary("sys", "user")

        assert completion.call_args.kwargs["provider"]["quantizations"] == ["fp16", "bf16", "fp32"]

    def test_openrouter_retries_without_quantization_filter_when_no_fp_route_exists(self):
        p = SummaryProvider(provider="openrouter", model="meta-llama/llama-3.1-70b")

        class _Message:
            content = "ok"
            reasoning_content = ""

        class _Choice:
            message = _Message()

        class _Usage:
            prompt_tokens = 1
            completion_tokens = 1

        class _Response:
            choices = [_Choice()]
            usage = _Usage()

        calls: list[dict] = []

        def _fake_completion(**kwargs):
            calls.append(kwargs)
            if "provider" in kwargs:
                raise RuntimeError("No providers available for requested quantizations")
            return _Response()

        with patch("summaryarena.providers.litellm.completion", side_effect=_fake_completion):
            result = p.generate_summary("sys", "user")

        assert result.text == "ok"
        assert len(calls) == 2
        assert "provider" in calls[0]
        assert "provider" not in calls[1]

    def test_vllm_prefix(self):
        p = SummaryProvider(provider="vllm", model="my-model")
        assert p.litellm_model == "hosted_vllm/my-model"

    def test_openai_no_prefix(self):
        p = SummaryProvider(provider="openai", model="gpt-4o")
        assert p.litellm_model == "gpt-4o"

    def test_default_base_urls(self):
        p = SummaryProvider(provider="lm_studio", model="test")
        assert p.base_url == "http://localhost:1234/v1"

    def test_lm_studio_rest_base_url_conversion(self):
        p = SummaryProvider(provider="lm_studio", model="test")
        assert p._lm_studio_rest_base_url() == "http://localhost:1234/api/v1"

    def test_custom_base_url_override(self):
        p = SummaryProvider(
            provider="ollama", model="test", base_url="http://remote:11434"
        )
        assert p.base_url == "http://remote:11434"

    def test_connection_accepts_reasoning_only_output(self):
        p = SummaryProvider(provider="lm_studio", model="test")

        class _Message:
            content = ""
            reasoning_content = " okay"

        class _Choice:
            message = _Message()

        class _Response:
            choices = [_Choice()]

        with patch("summaryarena.providers.litellm.completion", return_value=_Response()):
            assert p.test_connection() is True

    def test_generate_summary_does_not_use_reasoning_only_content_as_final_text(self):
        p = SummaryProvider(provider="openrouter", model="test")

        class _Message:
            content = ""
            reasoning_content = "<think>private reasoning only</think>"

        class _Choice:
            message = _Message()

        class _Usage:
            prompt_tokens = 12
            completion_tokens = 7

        class _Response:
            choices = [_Choice()]
            usage = _Usage()

        with patch("summaryarena.providers.litellm.completion", return_value=_Response()):
            result = p.generate_summary("sys", "user")

        assert result.text == ""
        assert result.input_tokens == 12
        assert result.output_tokens == 7

    def test_refresh_model_metadata_fetches_lm_studio_quantization(self):
        p = SummaryProvider(provider="lm_studio", model="meta-llama-3.1-8b-instruct")

        class _Response:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return b'{"id":"meta-llama-3.1-8b-instruct","quantization":"Q4_K_M"}'

        with patch("summaryarena.providers.urlopen", return_value=_Response()):
            p.refresh_model_metadata()

        assert p.quantization == "Q4_K_M"

    def test_generate_summary_uses_cleaned_reasoning_fallback_when_answer_is_appended(self):
        p = SummaryProvider(provider="lm_studio", model="test")

        class _Message:
            content = ""
            reasoning_content = "<think>internal reasoning</think>\nFinal summary text."

        class _Choice:
            message = _Message()

        class _Usage:
            prompt_tokens = 12
            completion_tokens = 7

        class _Response:
            choices = [_Choice()]
            usage = _Usage()

        with patch("summaryarena.providers.litellm.completion", return_value=_Response()):
            result = p.generate_summary("sys", "user")

        assert result.text == "Final summary text."
        assert result.input_tokens == 12
        assert result.output_tokens == 7

    def test_generate_summary_extracts_responses_api_output_text(self):
        p = SummaryProvider(provider="openrouter", model="test")

        class _OutputText:
            type = "output_text"
            text = "  Final summary text.  "

        class _MessageItem:
            type = "message"
            content = [_OutputText()]

        class _Usage:
            prompt_tokens = 12
            completion_tokens = 7

        class _Response:
            output = [_MessageItem()]
            usage = _Usage()
            choices = []

        with patch("summaryarena.providers.litellm.completion", return_value=_Response()):
            result = p.generate_summary("sys", "user")

        assert result.text == "Final summary text."
        assert result.input_tokens == 12
        assert result.output_tokens == 7

    def test_cloud_provider_parallel_requests_are_used(self):
        config = SummaryArenaConfig(
            provider="openai",
            model="gpt-4o",
            temperature=0.0,
            dataset_version="v1",
            parallel_requests=10,
        )
        provider = MagicMock(spec=SummaryProvider)
        provider.test_connection.return_value = True

        runner = BenchmarkRunner(
            provider=provider,
            config=config,
            categories=["news"],
            auto_metrics=False,
        )

        assert runner._parallel_requests() == 10
