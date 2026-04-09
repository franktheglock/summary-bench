"""Dataset curation script for Summary Arena.

Downloads data from HuggingFace datasets and curates test cases
for the Summary Arena benchmark. Run this to regenerate or extend
the datasets/v1/test_cases.json file.

Usage:
    pip install summaryarena[curation]
    python datasets/scripts/curate_datasets.py

Or to curate specific categories:
    python datasets/scripts/curate_datasets.py --categories news,meeting
"""

from __future__ import annotations

import json
import argparse
import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Output path
SCRIPT_DIR = Path(__file__).resolve().parent
DATASETS_DIR = SCRIPT_DIR.parent / "v1"
OUTPUT_FILE = DATASETS_DIR / "test_cases.json"


def curate_news(count: int = 20) -> list[dict]:
    """Curate news summarization test cases from CNN/DailyMail."""
    try:
        from datasets import load_dataset
    except ImportError:
        logger.error("Install curation extras: pip install summaryarena[curation]")
        return []

    logger.info("Loading CNN/DailyMail dataset...")
    ds = load_dataset("cnn_dailymail", "3.0.0", split="test", streaming=True)

    cases = []
    for i, example in enumerate(ds):
        if len(cases) >= count:
            break

        article = example["article"]
        highlights = example["highlights"]

        # Filter by token length (rough estimate: 1 token ≈ 4 chars)
        approx_tokens = len(article) // 4
        if approx_tokens < 512 or approx_tokens > 2048:
            continue

        cases.append({
            "test_id": f"news-cnn-{len(cases) + 1:03d}",
            "category": "news",
            "input_text": article,
            "gold_summary": highlights,
            "context_length_tokens": approx_tokens,
            "source": "cnn_dailymail/3.0.0",
            "prompt_template_key": "news",
        })

    logger.info("Curated %d news cases", len(cases))
    return cases


def curate_meeting(count: int = 10) -> list[dict]:
    """Curate meeting summarization test cases from QMSum."""
    try:
        from datasets import load_dataset
    except ImportError:
        logger.error("Install curation extras: pip install summaryarena[curation]")
        return []

    logger.info("Loading QMSum dataset...")
    try:
        ds = load_dataset("Yale-LILY/QMSum", split="test", trust_remote_code=True)
    except Exception as e:
        logger.warning("Could not load QMSum: %s. Skipping.", e)
        return []

    cases = []
    for i, example in enumerate(ds):
        if len(cases) >= count:
            break

        # QMSum has meeting_transcripts and queries
        transcript = example.get("input", example.get("src", ""))
        summary = example.get("output", example.get("tgt", ""))

        if not transcript or len(transcript) < 500:
            continue

        approx_tokens = len(transcript) // 4

        cases.append({
            "test_id": f"meeting-{len(cases) + 1:03d}",
            "category": "meeting",
            "input_text": transcript,
            "gold_summary": summary if summary else None,
            "context_length_tokens": approx_tokens,
            "source": "qmsum",
            "prompt_template_key": "meeting",
        })

    logger.info("Curated %d meeting cases", len(cases))
    return cases


def curate_scientific(count: int = 10) -> list[dict]:
    """Curate scientific summarization test cases from arXiv."""
    try:
        from datasets import load_dataset
    except ImportError:
        logger.error("Install curation extras: pip install summaryarena[curation]")
        return []

    logger.info("Loading scientific_papers dataset (arXiv subset)...")
    try:
        ds = load_dataset("scientific_papers", "arxiv", split="test", streaming=True)
    except Exception as e:
        logger.warning("Could not load scientific_papers: %s. Skipping.", e)
        return []

    cases = []
    for i, example in enumerate(ds):
        if len(cases) >= count:
            break

        article = example.get("article", "")
        abstract = example.get("abstract", "")

        # Use abstract as gold summary, article as input
        approx_tokens = len(article) // 4
        if approx_tokens < 1000 or approx_tokens > 8000:
            continue

        cases.append({
            "test_id": f"scientific-{len(cases) + 1:03d}",
            "category": "scientific",
            "input_text": article[:32000],  # Cap to avoid huge inputs
            "gold_summary": abstract,
            "context_length_tokens": min(approx_tokens, 8000),
            "source": "scientific_papers/arxiv",
            "prompt_template_key": "scientific",
        })

    logger.info("Curated %d scientific cases", len(cases))
    return cases


def main():
    parser = argparse.ArgumentParser(description="Curate datasets for Summary Arena")
    parser.add_argument(
        "--categories",
        type=str,
        default="news,meeting,scientific",
        help="Comma-separated categories to curate (default: news,meeting,scientific)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(OUTPUT_FILE),
        help="Output JSON file path",
    )
    parser.add_argument(
        "--merge",
        action="store_true",
        help="Merge with existing test_cases.json instead of overwriting",
    )
    args = parser.parse_args()

    categories = [c.strip() for c in args.categories.split(",")]
    output_path = Path(args.output)

    # Load existing cases if merging
    existing_cases: list[dict] = []
    existing_ids: set[str] = set()
    if args.merge and output_path.exists():
        with open(output_path) as f:
            existing_cases = json.load(f)
            existing_ids = {c["test_id"] for c in existing_cases}
        logger.info("Loaded %d existing cases for merging", len(existing_cases))

    # Curate each category
    curators = {
        "news": curate_news,
        "meeting": curate_meeting,
        "scientific": curate_scientific,
    }

    new_cases: list[dict] = []
    for cat in categories:
        if cat in curators:
            cases = curators[cat]()
            # Filter out already-existing IDs
            cases = [c for c in cases if c["test_id"] not in existing_ids]
            new_cases.extend(cases)
        else:
            logger.warning(
                "No curator for category '%s'. "
                "Categories like code, agentic, legal, and reviews "
                "use hand-crafted cases in the JSON file directly.",
                cat,
            )

    # Combine
    all_cases = existing_cases + new_cases

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(all_cases, f, indent=2, ensure_ascii=False)

    logger.info(
        "Wrote %d total cases (%d new) to %s",
        len(all_cases),
        len(new_cases),
        output_path,
    )

    # Print summary
    cat_counts: dict[str, int] = {}
    for case in all_cases:
        cat = case["category"]
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    print("\n📊 Dataset Summary:")
    for cat, count in sorted(cat_counts.items()):
        print(f"  {cat}: {count} cases")
    print(f"  Total: {len(all_cases)} cases")


if __name__ == "__main__":
    main()
