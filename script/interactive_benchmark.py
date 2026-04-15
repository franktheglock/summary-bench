"""Interactive TUI benchmark runner with arrow keys, checkbox selection, and live filtering."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import questionary
from questionary import Choice
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()

LM_STUDIO_PARALLEL_DEFAULT = 4
CLOUD_PARALLEL_DEFAULT = 10
CLOUD_PARALLEL_PROVIDERS = {
    "openrouter",
    "openai",
    "groq",
    "together_ai",
    "nvidia_nim",
}

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_DIR = SCRIPT_DIR.parent
RESULTS_DIR = REPO_DIR / "results"

# Ensure results directory exists
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

PROVIDERS = [
    Choice(
        "LM Studio (http://localhost:1234/v1)",
        value={"name": "LM Studio", "key": "lm_studio", "url": "http://localhost:1234/v1"},
    ),
    Choice(
        "Ollama (http://localhost:11434)",
        value={"name": "Ollama", "key": "ollama", "url": "http://localhost:11434"},
    ),
    Choice("OpenRouter", value={"name": "OpenRouter", "key": "openrouter", "url": None}),
    Choice("OpenAI", value={"name": "OpenAI", "key": "openai", "url": None}),
    Choice("Groq", value={"name": "Groq", "key": "groq", "url": None}),
    Choice("Together AI", value={"name": "Together AI", "key": "together_ai", "url": None}),
    Choice(
        "vLLM (http://localhost:8000/v1)",
        value={"name": "vLLM", "key": "vllm", "url": "http://localhost:8000/v1"},
    ),
    Choice("Custom", value={"name": "Custom", "key": "custom", "url": None}),
]

CATEGORIES = [
    Choice("News - News article summarization", value="news", checked=True),
    Choice("Code - Code snippet summarization", value="code"),
    Choice("Agentic - Multi-turn agent traces", value="agentic"),
    Choice("Meeting - Meeting transcripts", value="meeting"),
    Choice("Legal - Legal document summarization", value="legal"),
    Choice("Scientific - Scientific paper summarization", value="scientific"),
    Choice("Reviews - Product review aggregation", value="reviews"),
]


def clear():
    os.system("cls" if os.name == "nt" else "clear")


def discover_models(base_url: str) -> list[dict]:
    import requests

    try:
        r = requests.get(f"{base_url}/models", timeout=10)
        r.raise_for_status()
        return r.json().get("data", [])
    except Exception:
        return []


def check_lmstudio_cli() -> bool:
    """Check if LM Studio CLI (lms) is available."""
    try:
        result = subprocess.run(
            ["lms", "--version"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            timeout=5,
        )
        return result.returncode == 0
    except Exception:
        return False


def load_model_lmstudio(model_id: str) -> bool:
    """Load a model using LM Studio CLI."""
    try:
        console.print(f"[dim]Loading model via LM Studio CLI: {model_id}...[/]")

        # First unload any current model
        subprocess.run(
            ["lms", "unload"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            timeout=30,
        )

        # Load the new model
        result = subprocess.run(
            ["lms", "load", model_id],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            timeout=120,
        )

        if result.returncode == 0:
            console.print(f"[green]Model loaded successfully![/]")
            # Wait a moment for the model to be ready
            time.sleep(2)
            return True
        else:
            console.print(f"[red]Failed to load model: {result.stderr}[/]")
            return False

    except subprocess.TimeoutExpired:
        console.print("[red]Timeout while loading model[/]")
        return False
    except Exception as e:
        console.print(f"[red]Error loading model: {e}[/]")
        return False


def run_benchmark(
    provider_key,
    model_id,
    base_url,
    categories,
    output_path,
    api_key=None,
    parallel_requests: int | None = None,
):
    from summaryarena.providers import SummaryProvider
    from summaryarena.runner import BenchmarkRunner
    from summaryarena.config import SummaryArenaConfig

    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    config = SummaryArenaConfig(
        provider=provider_key,
        model=model_id,
        base_url=base_url,
        api_key=api_key,
        temperature=0.0,
        parallel_requests=(
            parallel_requests
            if parallel_requests is not None
            else LM_STUDIO_PARALLEL_DEFAULT
            if provider_key == "lm_studio"
            else CLOUD_PARALLEL_DEFAULT
            if provider_key in CLOUD_PARALLEL_PROVIDERS
            else 1
        ),
    )

    provider = SummaryProvider(
        provider=provider_key,
        model=model_id,
        base_url=base_url,
        api_key=api_key,
        temperature=0.0,
    )

    console.print(f"\n[bold blue]Benchmarking {model_id}...[/]")

    runner = BenchmarkRunner(
        provider=provider,
        config=config,
        categories=categories if categories else None,
        auto_metrics=False,
    )

    try:
        result = runner.run(output_path=output_path)

        # Verify file was written
        if output_path.exists():
            console.print(f"[green]Confirmed: Results saved to {output_path}[/]")
            return True
        else:
            console.print(f"[red]Error: File not found at {output_path}[/]")
            return False

    except Exception as e:
        console.print(f"[red]Failed: {e}[/]")
        import traceback

        traceback.print_exc()
        return False


def main():
    clear()

    # Welcome
    console.print(
        Panel.fit(
            "[bold]Summary Arena[/] - Interactive Benchmark\n"
            "[dim]Use [arrow keys] to navigate, [space] to select, [enter] to confirm[/]",
            border_style="#C4704B",
        )
    )

    # Step 1: Select Provider
    prov = questionary.select(
        "Select your inference provider:",
        choices=PROVIDERS,
        use_arrow_keys=True,
        use_jk_keys=False,
    ).ask()

    if not prov:
        console.print("[yellow]Cancelled.[/]")
        return

    provider_key = prov["key"]
    base_url = prov.get("url")
    api_key = None
    is_lm_studio = provider_key == "lm_studio"

    # Check for LM Studio CLI
    use_cli = False
    if is_lm_studio:
        if check_lmstudio_cli():
            console.print("[green]LM Studio CLI detected - will auto-load models[/]")
            use_cli = True
        else:
            console.print("[yellow]LM Studio CLI not found (lms command)[/]")
            console.print("[dim]Install from: https://lmstudio.ai/docs/cli[/]")
            console.print("[dim]Falling back to manual mode[/]")
            time.sleep(2)

    # API Key / URL for cloud providers
    if provider_key in ("openrouter", "openai", "groq", "together_ai"):
        api_key = questionary.password("API Key:").ask()
        if not api_key:
            console.print("[yellow]Cancelled.[/]")
            return

        defaults = {
            "openai": "https://api.openai.com/v1",
            "openrouter": "https://openrouter.ai/api/v1",
            "groq": "https://api.groq.com/openai/v1",
            "together_ai": "https://api.together.xyz/v1",
        }
        base_url = questionary.text("Base URL:", default=defaults.get(provider_key, "")).ask()

    elif provider_key == "custom":
        base_url = questionary.text("Base URL:").ask()
        if not base_url:
            console.print("[yellow]Cancelled.[/]")
            return

    # Step 2: Discover and Select Models
    clear()
    console.print(f"[bold]Discovering models from {prov['name']}...[/]")

    models_data = []
    if base_url:
        models_data = discover_models(base_url)

    model_ids = []

    if models_data:
        console.print(f"[green]Found {len(models_data)} models![/]")

        # Create checkbox choices
        model_choices = [
            Choice(f"{m.get('id', 'unknown')}", value=m.get("id", "unknown")) for m in models_data
        ]

        # Add Select All option at top
        model_choices.insert(0, Choice("[Select All]", value="__ALL__"))

        selected = questionary.checkbox(
            "Select models to benchmark (space to toggle, type to filter):",
            choices=model_choices,
            use_arrow_keys=True,
            use_jk_keys=False,
            instruction="Space: select, Enter: confirm, Type: filter",
        ).ask()

        if selected is None:
            console.print("[yellow]Cancelled.[/]")
            return

        # Handle Select All
        if "__ALL__" in selected:
            model_ids = [m.get("id", "unknown") for m in models_data]
        else:
            model_ids = selected
    else:
        console.print("[yellow]No models discovered. Enter manually.[/]")
        # Manual entry with autocomplete
        manual_models = []
        while True:
            model = questionary.text("Model ID (empty to finish):", default="").ask()
            if not model:
                break
            manual_models.append(model)
        model_ids = manual_models

    if not model_ids:
        console.print("[yellow]No models selected.[/]")
        return

    console.print(f"[green]Selected {len(model_ids)} model(s)[/]")

    # Step 3: Select Categories
    clear()
    cat_selected = questionary.checkbox(
        "Select test categories:",
        choices=CATEGORIES,
        use_arrow_keys=True,
        use_jk_keys=False,
    ).ask()

    if not cat_selected:
        console.print("[yellow]No categories selected.[/]")
        return

    categories = cat_selected
    console.print(f"[green]Selected {len(categories)} categories[/]")

    # Step 4: Choose request concurrency
    default_parallel = (
        LM_STUDIO_PARALLEL_DEFAULT
        if provider_key == "lm_studio"
        else CLOUD_PARALLEL_DEFAULT
        if provider_key in CLOUD_PARALLEL_PROVIDERS
        else 1
    )

    parallel_value = questionary.text(
        "Concurrent requests per run:",
        default=str(default_parallel),
        validate=lambda text: text.isdigit() and 1 <= int(text) <= 16,
        instruction="Enter a value from 1 to 16",
    ).ask()

    if parallel_value is None:
        console.print("[yellow]Cancelled.[/]")
        return

    parallel_requests = int(parallel_value)

    # Step 5: Confirm
    clear()
    console.print("\n[bold]Configuration Summary[/]\n")

    table = Table(show_header=False, border_style="dim")
    table.add_column("Setting", style="bold cyan")
    table.add_column("Value")
    table.add_row("Provider", prov["name"])
    table.add_row("Base URL", base_url or "default")
    table.add_row("Models", f"{len(model_ids)} selected")
    if is_lm_studio:
        if use_cli:
            table.add_row("Auto-load", "Yes (via LM Studio CLI)")
        else:
            table.add_row("Auto-load", "No - manually load each model when prompted")
    table.add_row("Categories", ", ".join(categories))
    table.add_row("Parallel requests", str(parallel_requests))
    table.add_row("Output", str(RESULTS_DIR.absolute()))
    console.print(table)

    console.print()
    if not questionary.confirm("Start benchmark?").ask():
        console.print("[yellow]Cancelled.[/]")
        return

    # Run benchmarks
    successful = 0
    failed = 0

    for i, model_id in enumerate(model_ids, 1):
        clear()
        console.print(f"\n[bold]{'=' * 60}[/]")
        console.print(f"[bold]{i}/{len(model_ids)}: {model_id}[/]")
        console.print(f"[bold]{'=' * 60}[/]")

        # For LM Studio with CLI, auto-load the model
        if is_lm_studio and use_cli:
            if not load_model_lmstudio(model_id):
                console.print("[red]Failed to load model. Skipping...[/]")
                failed += 1
                continue
        elif is_lm_studio and not use_cli:
            # Manual mode - prompt user
            console.print(
                Panel.fit(
                    f"[bold]Please load this model in LM Studio:[/]\n\n"
                    f"[cyan]{model_id}[/]\n\n"
                    f"1. Open LM Studio\n"
                    f"2. Click 'Load Model' and select the model above\n"
                    f"3. Wait for it to load\n"
                    f"4. Make sure Local Server is running",
                    border_style="yellow",
                )
            )
            input("\nPress Enter when model is loaded...")

        safe_name = model_id.replace("/", "-").replace("\\", "-").replace("@", "_")
        output_path = RESULTS_DIR / f"results-{safe_name}.json"

        console.print(f"[dim]Output will be saved to: {output_path}[/]")

        ok = run_benchmark(
            provider_key=provider_key,
            model_id=model_id,
            base_url=base_url,
            categories=categories,
            output_path=output_path,
            api_key=api_key,
            parallel_requests=parallel_requests,
        )

        if ok:
            successful += 1
        else:
            failed += 1

        # Pause between models for LM Studio
        if is_lm_studio and i < len(model_ids):
            console.print("\n[yellow]Prepare to load the next model...[/]")
            time.sleep(2)

    # Summary
    clear()

    # List saved files
    saved_files = list(RESULTS_DIR.glob("results-*.json"))

    console.print(
        Panel.fit(
            f"[bold green]Benchmark Complete![/]\n\n"
            f"Models tested: {successful + failed}\n"
            f"Successful: [green]{successful}[/]\n"
            f"Failed: [red]{failed}[/]\n"
            f"Files saved: {len(saved_files)}\n\n"
            f"Results directory: {RESULTS_DIR.absolute()}\n\n"
            f"[dim]Upload at: http://localhost:3000/upload[/]",
            title="Summary",
            border_style="green",
        )
    )

    if saved_files:
        console.print("\n[dim]Saved files:[/]")
        for f in sorted(saved_files)[-5:]:  # Show last 5
            console.print(f"  - {f.name}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print("\n[yellow]Interrupted.[/]")
        sys.exit(0)
    except Exception as e:
        console.print(f"\n[red]Error: {e}[/]")
        import traceback

        traceback.print_exc()
        sys.exit(1)
