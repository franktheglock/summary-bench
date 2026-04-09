"""Optional auto-metrics computation (ROUGE-L, BERTScore)."""

from __future__ import annotations

import logging

from summaryarena.models import AutoMetrics

logger = logging.getLogger(__name__)


def compute_auto_metrics(
    prediction: str,
    reference: str | None,
) -> AutoMetrics | None:
    """Compute auto-metrics for a single prediction/reference pair.

    Only computes if a reference (gold summary) is available.
    ROUGE-L and BERTScore require optional dependencies.

    Args:
        prediction: The generated summary.
        reference: The gold/reference summary. If None, returns None.

    Returns:
        AutoMetrics with scores, or None if no reference.
    """
    if not reference:
        return None

    rouge_l = _compute_rouge_l(prediction, reference)
    bert_f1 = _compute_bert_score(prediction, reference)

    if rouge_l is None and bert_f1 is None:
        return None

    return AutoMetrics(rouge_l=rouge_l, bert_score_f1=bert_f1)


def _compute_rouge_l(prediction: str, reference: str) -> float | None:
    """Compute ROUGE-L F1 score."""
    try:
        from rouge_score import rouge_scorer

        scorer = rouge_scorer.RougeScorer(["rougeL"], use_stemmer=True)
        scores = scorer.score(reference, prediction)
        return round(scores["rougeL"].fmeasure, 4)
    except ImportError:
        logger.debug("rouge-score not installed, skipping ROUGE-L")
        return None
    except Exception as e:
        logger.warning("ROUGE-L computation failed: %s", e)
        return None


def _compute_bert_score(prediction: str, reference: str) -> float | None:
    """Compute BERTScore F1."""
    try:
        from bert_score import score as bert_score_fn

        _, _, f1 = bert_score_fn(
            [prediction],
            [reference],
            lang="en",
            verbose=False,
            rescale_with_baseline=True,
        )
        return round(f1.item(), 4)
    except ImportError:
        logger.debug("bert-score not installed, skipping BERTScore")
        return None
    except Exception as e:
        logger.warning("BERTScore computation failed: %s", e)
        return None
