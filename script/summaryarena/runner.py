"""Benchmark runner — orchestrates test case execution."""

from __future__ import annotations

import json
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from rich.console import Console
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeElapsedColumn,
)

from summaryarena.config import SummaryArenaConfig
from summaryarena.datasets import load_test_cases
from summaryarena.metrics import compute_auto_metrics
from summaryarena.models import (
    BenchmarkResult,
    RunConfig,
    TestCase,
    TestResult,
)
from summaryarena.prompts import get_prompt
from summaryarena.providers import SummaryProvider

logger = logging.getLogger(__name__)
console = Console()

# Maximum retries per test case
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 2.0

# Wait for a provider to become ready before starting the benchmark.
CONNECTION_RETRIES = 6
CONNECTION_RETRY_DELAY_SECONDS = 2.0

CLOUD_PARALLEL_PROVIDERS = {
    "openrouter",
    "openai",
    "groq",
    "together_ai",
    "nvidia_nim",
}


class BenchmarkRunner:
    """Runs the summarization benchmark across test cases."""

    def __init__(
        self,
        provider: SummaryProvider,
        config: SummaryArenaConfig,
        categories: list[str] | None = None,
        auto_metrics: bool = False,
    ) -> None:
        self.provider = provider
        self.config = config
        self.categories = categories
        self.auto_metrics = auto_metrics
        self.run_id = str(uuid.uuid4())

    def run(self, output_path: Path | None = None) -> BenchmarkResult:
        """Execute the full benchmark.

        Args:
            output_path: Path to write results JSON. If None, writes to current dir.

        Returns:
            The complete BenchmarkResult.
        """
        # Load test cases
        console.print("\n[bold blue]📂 Loading test cases...[/]")
        test_cases = load_test_cases(
            version=self.config.dataset_version,
            categories=self.categories,
        )
        console.print(f"   Found [green]{len(test_cases)}[/] test cases")

        if not test_cases:
            console.print("[red]No test cases found for the specified categories.[/]")
            raise SystemExit(1)

        # Show category breakdown
        cat_counts: dict[str, int] = {}
        for tc in test_cases:
            cat_counts[tc.category] = cat_counts.get(tc.category, 0) + 1
        for cat, count in sorted(cat_counts.items()):
            console.print(f"   • {cat}: {count} cases")

        # Test provider connection
        console.print("\n[bold blue]🔌 Testing provider connection...[/]")
        if not self._wait_for_provider_connection():
            console.print("[red]❌ Cannot reach provider. Check your config.[/]")
            raise SystemExit(1)
        console.print("[green]   ✓ Provider is reachable[/]")

        # Run benchmarks
        parallel_requests = self._parallel_requests()
        if parallel_requests > 1:
            console.print(
                f"\n[bold blue]🏃 Running benchmark (run_id: {self.run_id[:8]}..., parallel={parallel_requests})[/]"
            )
        else:
            console.print(f"\n[bold blue]🏃 Running benchmark (run_id: {self.run_id[:8]}...)[/]")
        results: list[TestResult] = []

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            MofNCompleteColumn(),
            TimeElapsedColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("Benchmarking", total=len(test_cases))

            if parallel_requests > 1:
                results = self._run_test_cases_parallel(test_cases, progress, task, parallel_requests)
            else:
                for test_case in test_cases:
                    result = self._run_single(test_case)
                    if result:
                        results.append(result)
                    progress.advance(task)

        # Build the result object
        benchmark_result = BenchmarkResult(
            benchmark_version="1.0",
            run_id=self.run_id,
            model=self.config.model,
            provider=self.config.provider,
            timestamp=datetime.now(timezone.utc),
            config=RunConfig(
                provider=self.config.provider,
                model=self.config.model,
                base_url=self.config.base_url,
                temperature=self.config.temperature,
                categories=list(cat_counts.keys()),
                benchmark_version=self.config.dataset_version,
            ),
            results=results,
        )

        # Print summary
        stats = benchmark_result.summary_stats()
        console.print(f"\n[bold green]✅ Benchmark complete![/]")
        console.print(f"   Tests run: {stats['total_tests']}")
        console.print(f"   Categories: {', '.join(stats['categories'])}")
        console.print(f"   Total input tokens: {stats['total_input_tokens']:,}")
        console.print(f"   Total output tokens: {stats['total_output_tokens']:,}")
        console.print(f"   Avg latency: {stats['avg_latency_ms']:,}ms")

        # Write output
        out_path = output_path or Path(self.config.output_dir) / "results.json"
        self._write_results(benchmark_result, out_path)

        return benchmark_result

    def _wait_for_provider_connection(self) -> bool:
        """Retry provider readiness checks before failing the benchmark."""
        for attempt in range(1, CONNECTION_RETRIES + 1):
            if self.provider.test_connection():
                return True

            if attempt < CONNECTION_RETRIES:
                console.print(
                    f"[yellow]   Provider not ready yet, retrying in {CONNECTION_RETRY_DELAY_SECONDS:.0f}s "
                    f"({attempt}/{CONNECTION_RETRIES})...[/]"
                )
                time.sleep(CONNECTION_RETRY_DELAY_SECONDS)

        return False

    def _parallel_requests(self) -> int:
        """Return the active parallel request count for this run."""
        if self.config.provider == "lm_studio":
            return max(1, self.config.parallel_requests)
        if self.config.provider in CLOUD_PARALLEL_PROVIDERS:
            return max(1, self.config.parallel_requests)
        return 1

    def _run_test_cases_parallel(
        self,
        test_cases: list[TestCase],
        progress: Progress,
        task: int,
        max_workers: int,
    ) -> list[TestResult]:
        """Run test cases concurrently while preserving input order in the output file."""
        ordered_results: list[TestResult | None] = [None] * len(test_cases)

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_index = {
                executor.submit(self._run_single, test_case): index
                for index, test_case in enumerate(test_cases)
            }

            for future in as_completed(future_to_index):
                index = future_to_index[future]
                try:
                    ordered_results[index] = future.result()
                except Exception as e:
                    logger.warning("Parallel benchmark task %d failed: %s", index, e)
                    ordered_results[index] = None
                finally:
                    progress.advance(task)

        return [result for result in ordered_results if result is not None]

    def _run_single(self, test_case: TestCase) -> TestResult | None:
        """Run a single test case with retry logic."""

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                # Build prompts
                system_prompt, user_prompt = get_prompt(
                    template_key=test_case.prompt_template_key,
                    input_text=test_case.input_text,
                    version=self.config.dataset_version,
                )

                # Generate summary
                gen_result = self.provider.generate_summary(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                )

                # Compute auto-metrics if enabled
                auto_metrics = None
                if self.auto_metrics and test_case.gold_summary:
                    auto_metrics = compute_auto_metrics(
                        prediction=gen_result.text,
                        reference=test_case.gold_summary,
                    )

                return TestResult(
                    test_id=test_case.test_id,
                    category=test_case.category,
                    summary=gen_result.text,
                    prompt_used=user_prompt if logger.isEnabledFor(logging.DEBUG) else None,
                    input_tokens=gen_result.input_tokens,
                    output_tokens=gen_result.output_tokens,
                    latency_ms=gen_result.latency_ms,
                    auto_metrics=auto_metrics,
                )

            except Exception as e:
                logger.warning(
                    "Test %s attempt %d/%d failed: %s",
                    test_case.test_id,
                    attempt,
                    MAX_RETRIES,
                    e,
                )
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY_SECONDS * attempt)
                else:
                    console.print(
                        f"[yellow]⚠ Skipping {test_case.test_id} after {MAX_RETRIES} failures[/]"
                    )
                    return None

        return None

    def _write_results(self, result: BenchmarkResult, path: Path) -> None:
        """Write benchmark results to a JSON file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(result.model_dump(mode="json"), f, indent=2, default=str)
        console.print(f"\n[bold]📄 Results written to: {path}[/]")
