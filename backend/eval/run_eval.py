"""Command-line entry point for the offline synthetic evaluation."""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from .dataset import DATASET_PROVENANCE, EVALUATION_CASES
from .metrics import evaluate_aliases, evaluate_retrieval, evaluate_scores


def build_report(rag_mode: str = "local", retrieval_top_k: int = 3) -> dict:
    """Run all offline metrics and return a JSON-serializable report."""
    started = time.perf_counter()
    score = evaluate_scores(EVALUATION_CASES)
    alias = evaluate_aliases()
    retrieval = evaluate_retrieval(mode=rag_mode, top_k=retrieval_top_k)
    total_seconds = time.perf_counter() - started

    limitations = [
        (
            "All score and retrieval fixtures are synthetic; expected ranges and "
            "relevant_ids are hand-authored project test expectations, not human "
            "real annotations."
        ),
        ("Offline evaluation makes no hosted-model calls and reports no Token counts or costs."),
    ]
    if retrieval["mode"] == "local-hybrid":
        limitations.append(
            "Default retrieval is local-hybrid only; BGE/Chroma reranking was not "
            "run and no BGE quality or latency is claimed."
        )
    else:
        limitations.append(
            "BGE metrics come only from the actual MaterialRetriever(mode='bge') "
            "path; no simulated or cached BGE score is used."
        )

    if retrieval["component_comparison_available"]:
        limitations.append(
            "BM25 and sparse_vector component Recall@k use actual helpers from the "
            "current local retriever; a separate dense-vector baseline is not "
            "measured in local mode."
        )
    else:
        limitations.append(
            "Only local-hybrid Recall@k is measured because BM25/sparse helper "
            "functions are unavailable; a separate dense-vector baseline is not "
            "measured."
        )
    limitations.append("Timings are local wall-clock perf_counter measurements and will vary between runs.")

    return {
        "schema_version": 1,
        "generated_at": datetime.now(UTC).isoformat(),
        "dataset_provenance": DATASET_PROVENANCE,
        "count": score["count"],
        "mode": retrieval["mode"],
        "retrieval_top_k": retrieval_top_k,
        "metrics": {
            "score": score,
            "alias": alias,
            "retrieval": retrieval,
        },
        "results": {
            "score_cases": score["cases"],
            "alias_cases": alias["cases"],
            "retrieval_cases": retrieval["cases"],
        },
        "limitations": limitations,
        "timing": {
            "parser_and_scoring_seconds": score["duration_seconds"],
            "alias_seconds": alias["duration_seconds"],
            "retrieval_seconds": retrieval["duration_seconds"],
            "total_seconds": total_seconds,
        },
    }


def _write_json(path: Path, report: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the offline synthetic 职启云帆 evaluation")
    parser.add_argument(
        "--output",
        default="docs/evaluation-report.json",
        help="JSON report path (default: docs/evaluation-report.json)",
    )
    parser.add_argument(
        "--rag-mode",
        choices=("local", "bge"),
        default="local",
        help="Retrieval mode: local hybrid (default) or actual optional BGE path",
    )
    parser.add_argument(
        "--retrieval-top-k",
        type=int,
        default=3,
        help="Recall@k cutoff (default: 3)",
    )
    parser.add_argument(
        "--min-score-accuracy",
        type=float,
        default=None,
        help="Optional 0..1 regression gate for score range accuracy",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    if args.min_score_accuracy is not None and not 0.0 <= args.min_score_accuracy <= 1.0:
        parser.error("--min-score-accuracy must be between 0 and 1")
    if args.retrieval_top_k <= 0:
        parser.error("--retrieval-top-k must be greater than 0")

    try:
        report = build_report(rag_mode=args.rag_mode, retrieval_top_k=args.retrieval_top_k)
    except Exception as exc:
        print(f"evaluation failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2

    if args.min_score_accuracy is not None:
        accuracy = float(report["metrics"]["score"]["accuracy"])
        report["thresholds"] = {
            "minimum_score_accuracy": args.min_score_accuracy,
            "actual_score_accuracy": accuracy,
            "passed": accuracy >= args.min_score_accuracy,
        }

    _write_json(Path(args.output), report)
    print(
        f"score_accuracy={report['metrics']['score']['accuracy']:.3f} "
        f"retrieval_recall@{args.retrieval_top_k}="
        f"{report['metrics']['retrieval']['mean_recall_at_k']:.3f} "
        f"mode={report['mode']} output={args.output}"
    )

    if args.min_score_accuracy is not None and not report["thresholds"]["passed"]:
        print(
            f"score accuracy gate failed: {report['metrics']['score']['accuracy']:.3f} < {args.min_score_accuracy:.3f}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
