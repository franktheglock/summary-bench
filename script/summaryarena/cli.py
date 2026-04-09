"""Summary Arena CLI — Typer application."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from summaryarena import __version__
from summaryarena.config import SummaryArenaConfig, CONFIG_FILE
from summaryarena.models import BenchmarkResult, VALID_CATEGORIES

LM_STUDIO_PARALLEL_DEFAULT = 4
CLOUD_PARALLEL_DEFAULT = 10
CLOUD_PARALLEL_PROVIDERS = {
    "openrouter",
    "openai",
    "groq",
    "together_ai",
    "nvidia_nim",
}

app = typer.Typer(
    name="summaryarena",
    help="🏟️ Summary Arena — benchmark LLM summarization quality across providers.",
    add_completion=False,
)
console = Console()


def _setup_logging(verbose: bool = False) -> None:
    """Configure logging based on verbosity."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    # Suppress noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("litellm").setLevel(logging.WARNING)


@app.callback()
def main(
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Enable verbose logging"),
) -> None:
    """Summary Arena CLI."""
    _setup_logging(verbose)


@app.command()
def version() -> None:
    """Show the current version."""
    console.print(f"summaryarena v{__version__}")


@app.command()
def init(
    provider: str = typer.Option("ollama", help="Default inference provider"),
    model: str = typer.Option("llama3.1", help="Default model name"),
    base_url: str | None = typer.Option(None, help="Custom API base URL"),
    force: bool = typer.Option(False, "--force", "-f", help="Overwrite existing config"),
) -> None:
    """Initialize Summary Arena configuration.

    Creates ~/.summaryarena/config.yaml with your provider settings.
    """
    if CONFIG_FILE.exists() and not force:
        console.print(f"[yellow]Config already exists at {CONFIG_FILE}[/]")
        console.print("Use --force to overwrite.")
        raise typer.Exit(1)

    config = SummaryArenaConfig(
        provider=provider,
        model=model,
        base_url=base_url,
    )
    path = config.save()

    console.print(f"\n[bold green]✅ Config created at {path}[/]")
    console.print("\nEdit it to customize your settings:")
    console.print(f"  [dim]{path}[/]")
    console.print("\nQuick start:")
    console.print("  summaryarena list-categories")
    console.print("  summaryarena run --provider ollama --model llama3.1")


@app.command("list-categories")
def list_categories() -> None:
    """Show all available test categories and their test case counts."""
    from summaryarena.datasets import get_category_stats

    stats = get_category_stats()

    table = Table(title="📋 Available Categories", show_header=True)
    table.add_column("Category", style="cyan", no_wrap=True)
    table.add_column("Test Cases", justify="right", style="green")
    table.add_column("Status", style="dim")

    for cat in VALID_CATEGORIES:
        count = stats.get(cat, 0)
        status = "✓ ready" if count > 0 else "⚠ no data"
        style = "" if count > 0 else "dim"
        table.add_row(cat, str(count), status, style=style)

    total = sum(stats.values())
    table.add_section()
    table.add_row("[bold]Total[/]", f"[bold]{total}[/]", "")

    console.print()
    console.print(table)


@app.command()
def run(
    provider: str | None = typer.Option(None, help="Inference provider (overrides config)"),
    model: str | None = typer.Option(None, help="Model name (overrides config)"),
    base_url: str | None = typer.Option(None, "--base-url", help="API base URL"),
    api_key: str | None = typer.Option(None, "--api-key", help="API key"),
    categories: str | None = typer.Option(
        None, help="Comma-separated categories (e.g. 'news,code')"
    ),
    temperature: float | None = typer.Option(None, help="Sampling temperature"),
    runs: int = typer.Option(1, "--runs", "-n", help="Number of runs", min=1, max=10),
    output: str = typer.Option("results.json", "-o", "--output", help="Output file path"),
    parallel_requests: int | None = typer.Option(
        None,
        "--parallel-requests",
        help="Concurrent requests to issue per benchmark run (LM Studio recommended)",
        min=1,
        max=16,
    ),
    auto_metrics: bool = typer.Option(
        False, "--auto-metrics", help="Compute ROUGE-L and BERTScore (requires extras)"
    ),
) -> None:
    """Run the summarization benchmark.

    Sends test cases to your LLM provider and records summaries + metrics.
    All inference stays on your machine — nothing is uploaded.
    """
    from summaryarena.providers import SummaryProvider
    from summaryarena.runner import BenchmarkRunner

    # Load config and apply overrides
    config = SummaryArenaConfig.load()
    if provider:
        config.provider = provider
    if model:
        config.model = model
    if base_url:
        config.base_url = base_url
    if api_key:
        config.api_key = api_key
    if temperature is not None:
        config.temperature = temperature
    if parallel_requests is not None:
        config.parallel_requests = parallel_requests
    elif config.provider == "lm_studio":
        config.parallel_requests = LM_STUDIO_PARALLEL_DEFAULT
    elif config.provider in CLOUD_PARALLEL_PROVIDERS:
        config.parallel_requests = CLOUD_PARALLEL_DEFAULT
    if auto_metrics:
        config.auto_metrics = auto_metrics

    # Parse categories
    cat_list: list[str] | None = None
    if categories:
        cat_list = [c.strip() for c in categories.split(",")]
        invalid = set(cat_list) - set(VALID_CATEGORIES)
        if invalid:
            console.print(f"[red]Invalid categories: {invalid}[/]")
            console.print(f"Valid: {VALID_CATEGORIES}")
            raise typer.Exit(1)

    console.print(f"\n[bold]🏟️ Summary Arena v{__version__}[/]")
    console.print(f"   Provider: [cyan]{config.provider}[/]")
    console.print(f"   Model:    [cyan]{config.model}[/]")
    console.print(f"   Temp:     {config.temperature}")
    console.print(f"   Parallel: {config.parallel_requests}")
    if cat_list:
        console.print(f"   Categories: {', '.join(cat_list)}")
    console.print(f"   Runs:     {runs}")

    # Initialize provider
    llm = SummaryProvider(
        provider=config.provider,
        model=config.model,
        base_url=config.base_url,
        api_key=config.api_key,
        temperature=config.temperature,
    )

    # Run benchmark(s)
    for run_num in range(1, runs + 1):
        if runs > 1:
            console.print(f"\n[bold]━━━ Run {run_num}/{runs} ━━━[/]")

        runner = BenchmarkRunner(
            provider=llm,
            config=config,
            categories=cat_list,
            auto_metrics=config.auto_metrics,
        )

        # Determine output path (append run number if multiple runs)
        out = Path(output)
        if runs > 1:
            out = out.with_stem(f"{out.stem}-run{run_num}")

        runner.run(output_path=out)


@app.command()
def validate(
    results_file: Path = typer.Argument(..., help="Path to results JSON file"),
) -> None:
    """Validate a results JSON file against the expected schema.

    Checks that the file conforms to the BenchmarkResult schema and reports
    any issues found.
    """
    if not results_file.exists():
        console.print(f"[red]File not found: {results_file}[/]")
        raise typer.Exit(1)

    console.print(f"\n[bold]🔍 Validating: {results_file}[/]")

    try:
        with open(results_file, encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        console.print(f"[red]❌ Invalid JSON: {e}[/]")
        raise typer.Exit(1)

    try:
        result = BenchmarkResult(**data)
    except Exception as e:
        console.print(f"[red]❌ Schema validation failed:[/]")
        console.print(f"   {e}")
        raise typer.Exit(1)

    stats = result.summary_stats()

    console.print("[green]✅ Valid![/]")
    console.print(f"   Run ID:     {result.run_id}")
    console.print(f"   Model:      {result.model}")
    console.print(f"   Provider:   {result.provider}")
    console.print(f"   Timestamp:  {result.timestamp}")
    console.print(f"   Tests:      {stats['total_tests']}")
    console.print(f"   Categories: {', '.join(stats['categories'])}")

    # Check for common issues
    issues: list[str] = []

    # Check for empty summaries
    empty = [r.test_id for r in result.results if not r.summary.strip()]
    if empty:
        issues.append(f"{len(empty)} empty summaries: {empty[:3]}...")

    # Check for suspiciously short summaries
    short = [r.test_id for r in result.results if len(r.summary) < 20]
    if short:
        issues.append(f"{len(short)} very short summaries (<20 chars)")

    # Check for zero latency
    zero_lat = [r.test_id for r in result.results if r.latency_ms == 0]
    if zero_lat:
        issues.append(f"{len(zero_lat)} results with 0ms latency")

    if issues:
        console.print("\n[yellow]⚠ Warnings:[/]")
        for issue in issues:
            console.print(f"  • {issue}")
    else:
        console.print("\n[green]   No issues found.[/]")


@app.command()
def upload(
    results_file: Path = typer.Argument(..., help="Path to results JSON file"),
) -> None:
    """Upload results to the Summary Arena website (coming soon).

    For now, manually upload your results.json at https://summaryarena.dev/submit
    """
    if not results_file.exists():
        console.print(f"[red]File not found: {results_file}[/]")
        raise typer.Exit(1)

    console.print("\n[bold yellow]🚧 Direct upload is coming soon![/]")
    console.print("\nIn the meantime, upload your results manually:")
    console.print("  1. Go to [cyan]https://summaryarena.dev/submit[/]")
    console.print(f"  2. Drag and drop [bold]{results_file}[/]")
    console.print("  3. Your results will appear on the leaderboard after validation")


if __name__ == "__main__":
    app()
