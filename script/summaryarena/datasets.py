"""Dataset loading and management for Summary Arena."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from summaryarena.models import TestCase, VALID_CATEGORIES

logger = logging.getLogger(__name__)

# Resolve the datasets directory relative to the package
# The package is at script/summaryarena/, datasets is at the repo root datasets/
_PACKAGE_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _PACKAGE_DIR.parent.parent
_DATASETS_DIR = _REPO_ROOT / "datasets"


def get_datasets_dir(version: str = "v1") -> Path:
    """Get the path to the versioned datasets directory."""
    return _DATASETS_DIR / version


def load_test_cases(
    version: str = "v1",
    categories: list[str] | None = None,
    datasets_dir: Path | None = None,
) -> list[TestCase]:
    """Load test cases from the local datasets directory.

    Args:
        version: Dataset version (e.g., "v1").
        categories: Optional list of categories to filter by. If None, loads all.
        datasets_dir: Override the datasets directory path.

    Returns:
        List of validated TestCase objects.

    Raises:
        FileNotFoundError: If the test_cases.json file doesn't exist.
        ValueError: If invalid categories are requested.
    """
    base_dir = datasets_dir or get_datasets_dir(version)
    test_cases_path = base_dir / "test_cases.json"

    if not test_cases_path.exists():
        raise FileNotFoundError(
            f"Test cases not found at {test_cases_path}. "
            f"Run 'python datasets/scripts/curate_datasets.py' to generate them, "
            f"or download from the GitHub repository."
        )

    # Validate requested categories
    if categories:
        invalid = set(categories) - set(VALID_CATEGORIES)
        if invalid:
            raise ValueError(
                f"Invalid categories: {invalid}. Valid: {VALID_CATEGORIES}"
            )

    # Load and parse
    with open(test_cases_path, encoding="utf-8") as f:
        raw_cases: list[dict] = json.load(f)

    logger.info("Loaded %d raw test cases from %s", len(raw_cases), test_cases_path)

    # Parse into Pydantic models
    cases = [TestCase(**case) for case in raw_cases]

    # Filter by category if requested
    if categories:
        cases = [c for c in cases if c.category in categories]
        logger.info("Filtered to %d cases in categories: %s", len(cases), categories)

    return cases


def get_category_stats(version: str = "v1") -> dict[str, int]:
    """Get a count of test cases per category.

    Returns:
        Dict mapping category name to count.
    """
    try:
        cases = load_test_cases(version=version)
    except FileNotFoundError:
        return {}

    stats: dict[str, int] = {}
    for case in cases:
        stats[case.category] = stats.get(case.category, 0) + 1

    return dict(sorted(stats.items()))


def get_available_categories(version: str = "v1") -> list[str]:
    """Get list of categories that have test cases available."""
    stats = get_category_stats(version)
    return list(stats.keys()) if stats else list(VALID_CATEGORIES)
