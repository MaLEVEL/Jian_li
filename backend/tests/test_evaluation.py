"""Tests for the offline, synthetic evaluation harness."""

import json
import sys
from collections import Counter

import pytest
from eval.dataset import DATASET_PROVENANCE, EVALUATION_CASES, RETRIEVAL_CASES
from eval.metrics import evaluate_aliases, evaluate_retrieval, evaluate_scores
from eval.run_eval import build_report, main


def test_score_dataset_is_30_distinct_explicitly_synthetic_cases():
    assert len(EVALUATION_CASES) == 30
    assert len({case["id"] for case in EVALUATION_CASES}) == 30
    assert len({(case["jd_text"], case["resume_text"]) for case in EVALUATION_CASES}) == 30
    assert Counter(case["category"] for case in EVALUATION_CASES) == {
        "strong_coverage": 15,
        "weak_or_nonmatching": 15,
    }
    assert all(case["synthetic"] is True for case in EVALUATION_CASES)
    assert all("Synthetic" in case["company"] for case in EVALUATION_CASES)

    for case in EVALUATION_CASES:
        expected = case["expected_score_range"]
        assert 0 <= expected["min"] <= expected["max"] <= 100
        assert expected["max"] - expected["min"] <= 20

    strong = [case for case in EVALUATION_CASES if case["category"] == "strong_coverage"]
    weak = [case for case in EVALUATION_CASES if case["category"] == "weak_or_nonmatching"]
    assert all(case["expected_score_range"]["min"] >= 70 for case in strong)
    assert all(case["expected_score_range"]["max"] <= 45 for case in weak)
    assert DATASET_PROVENANCE["score_cases"]["synthetic"] is True
    assert DATASET_PROVENANCE["score_cases"]["human_annotation"] is False


def test_score_evaluation_uses_real_parsers_and_expected_ranges():
    result = evaluate_scores(EVALUATION_CASES)

    assert result["count"] == 30
    assert result["accuracy"] == 1.0
    assert result["category_accuracy"] == {
        "strong_coverage": 1.0,
        "weak_or_nonmatching": 1.0,
    }
    assert len(result["cases"]) == 30
    assert result["duration_seconds"] > 0

    sample = result["cases"][0]
    assert {"id", "category", "expected_min", "expected_max", "actual_score", "in_range"} <= set(sample)
    assert sample["matched_skills"] or sample["missing_skills"]
    assert all(case["in_range"] for case in result["cases"])


def test_alias_evaluation_beats_exact_baseline_without_merging_frameworks():
    result = evaluate_aliases()

    assert result["production_alias_accuracy"] == 1.0
    assert result["exact_baseline_accuracy"] < 1.0
    assert result["distinct_framework_non_equivalence"] == 1.0
    assert result["alias_gain_over_exact"] > 0

    cases = {case["pair_id"]: case for case in result["cases"]}
    assert cases["sklearn_vs_scikit_learn"]["production_matched"] is True
    assert cases["sklearn_vs_scikit_learn"]["exact_baseline_matched"] is False
    assert cases["langchain_vs_langgraph"]["production_matched"] is False
    assert cases["langchain_vs_langgraph"]["exact_baseline_matched"] is False
    assert result["duration_seconds"] > 0


def test_retrieval_evaluation_measures_real_local_hybrid_and_components():
    result = evaluate_retrieval(RETRIEVAL_CASES, mode="local", top_k=3)

    assert result["mode"] == "local-hybrid"
    assert result["count"] == len(RETRIEVAL_CASES)
    assert result["mean_recall_at_k"] == pytest.approx(1.0)
    assert result["component_comparison_available"] is True
    assert result["metrics"]["hybrid"]["mean_recall_at_k"] == pytest.approx(1.0)
    assert "bm25" in result["metrics"]
    assert "sparse_vector" in result["metrics"]
    assert result["duration_seconds"] > 0

    for case in result["cases"]:
        assert case["relevant_ids"]
        assert 0 < case["recall_at_k"] <= 1
        assert all(set(hit) == {"id", "title", "content", "score", "source"} for hit in case["hits"])
        assert all(hit["source"] == "local-hybrid" for hit in case["hits"])


def test_retrieval_component_comparison_disables_when_helpers_unavailable(monkeypatch):
    monkeypatch.setattr("eval.metrics._component_helpers", lambda: None)

    result = evaluate_retrieval(RETRIEVAL_CASES[:1], mode="local", top_k=3)

    assert result["component_comparison_available"] is False
    assert set(result["metrics"]) == {"hybrid"}
    assert result["mean_recall_at_k"] == pytest.approx(1.0)


def test_retrieval_dataset_is_synthetic_and_independently_annotated():
    assert len(RETRIEVAL_CASES) >= 8
    assert len({case["id"] for case in RETRIEVAL_CASES}) == len(RETRIEVAL_CASES)
    assert all(case["synthetic"] is True for case in RETRIEVAL_CASES)
    assert all(case["relevant_ids"] for case in RETRIEVAL_CASES)

    for case in RETRIEVAL_CASES:
        material_ids = {material["id"] for material in case["materials"]}
        assert set(case["relevant_ids"]) <= material_ids

    assert DATASET_PROVENANCE["retrieval_cases"]["synthetic"] is True
    assert DATASET_PROVENANCE["retrieval_cases"]["human_annotation"] is False
    assert DATASET_PROVENANCE["retrieval_cases"]["independent_relevance_labels"] is True


def test_report_contains_provenance_metrics_limitations_and_actual_timings():
    report = build_report()

    assert report["count"] == 30
    assert report["mode"] == "local-hybrid"
    assert report["dataset_provenance"] == DATASET_PROVENANCE
    assert report["metrics"]["score"]["accuracy"] == 1.0
    assert report["metrics"]["alias"]["production_alias_accuracy"] == 1.0
    assert report["metrics"]["retrieval"]["mean_recall_at_k"] == pytest.approx(1.0)
    assert len(report["results"]["score_cases"]) == 30
    assert len(report["results"]["retrieval_cases"]) == len(RETRIEVAL_CASES)

    limitations = "\n".join(report["limitations"])
    assert "synthetic" in limitations
    assert "not human" in limitations
    assert "Token" in limitations
    assert "BGE" in limitations
    assert report["timing"]["total_seconds"] > 0
    assert report["timing"]["parser_and_scoring_seconds"] > 0
    assert "tokens" not in {key.lower() for key in report}
    json.dumps(report, ensure_ascii=False)


def test_cli_writes_report_and_succeeds_by_default(tmp_path, monkeypatch):
    output = tmp_path / "evaluation-report.json"
    monkeypatch.setattr(sys, "argv", ["run_eval", "--output", str(output)])

    assert main() == 0
    report = json.loads(output.read_text(encoding="utf-8"))
    assert report["count"] == 30
    assert report["mode"] == "local-hybrid"


def test_cli_optional_threshold_fails_only_below_specified_accuracy(tmp_path, monkeypatch):
    output = tmp_path / "evaluation-report.json"
    original_build = build_report

    def low_accuracy(**kwargs):
        report = original_build(**kwargs)
        report["metrics"]["score"]["accuracy"] = 0.75
        return report

    monkeypatch.setattr("eval.run_eval.build_report", low_accuracy)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "run_eval",
            "--output",
            str(output),
            "--min-score-accuracy",
            "0.8",
        ],
    )

    assert main() == 1
    report = json.loads(output.read_text(encoding="utf-8"))
    assert report["thresholds"]["minimum_score_accuracy"] == 0.8
    assert report["thresholds"]["passed"] is False


def test_cli_rejects_threshold_outside_unit_interval(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "run_eval",
            "--output",
            str(tmp_path / "report.json"),
            "--min-score-accuracy",
            "1.1",
        ],
    )

    with pytest.raises(SystemExit) as caught:
        main()

    assert caught.value.code == 2
    assert "between 0 and 1" in capsys.readouterr().err
