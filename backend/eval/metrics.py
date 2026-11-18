"""Metric implementations backed by the production offline functions."""

from __future__ import annotations

import time
from collections.abc import Callable
from pathlib import Path

from app.nodes.parsers import local_job, local_resume
from app.rag import MaterialRetriever
from app.tools.scoring import score_match

from .dataset import EVALUATION_CASES, RETRIEVAL_CASES

_PERSIST_DIRECTORY = str(Path(__file__).resolve().parents[1] / "data" / "evaluation-chroma")

_TRUE_ALIAS_CASES = [
    {
        "pair_id": "sklearn_vs_scikit_learn",
        "requirement": "scikit-learn",
        "resume_skill": "sklearn",
        "resume_text": "使用 sklearn 训练分类器",
        "should_match": True,
    },
    {
        "pair_id": "postgres_vs_postgresql",
        "requirement": "PostgreSQL",
        "resume_skill": "postgres",
        "resume_text": "维护 postgres 数据库",
        "should_match": True,
    },
    {
        "pair_id": "k8s_vs_kubernetes",
        "requirement": "Kubernetes",
        "resume_skill": "k8s",
        "resume_text": "部署服务到 k8s 集群",
        "should_match": True,
    },
    {
        "pair_id": "torch_vs_pytorch",
        "requirement": "PyTorch",
        "resume_skill": "torch",
        "resume_text": "使用 torch 训练模型",
        "should_match": True,
    },
    {
        "pair_id": "reactjs_vs_react",
        "requirement": "React",
        "resume_skill": "reactjs",
        "resume_text": "开发 reactjs 组件",
        "should_match": True,
    },
]

_DISTINCT_FRAMEWORK_CASES = [
    {
        "pair_id": "langchain_vs_langgraph",
        "requirement": "LangGraph",
        "resume_skill": "LangChain",
        "resume_text": "使用 LangChain 编排模型调用",
        "should_match": False,
    },
    {
        "pair_id": "java_vs_javascript",
        "requirement": "Java",
        "resume_skill": "JavaScript",
        "resume_text": "使用 JavaScript 开发页面",
        "should_match": False,
    },
    {
        "pair_id": "pytorch_vs_tensorflow",
        "requirement": "PyTorch",
        "resume_skill": "TensorFlow",
        "resume_text": "使用 TensorFlow 训练模型",
        "should_match": False,
    },
    {
        "pair_id": "fastapi_vs_django",
        "requirement": "FastAPI",
        "resume_skill": "Django",
        "resume_text": "使用 Django 开发后台",
        "should_match": False,
    },
]


def _accuracy(cases: list[dict], field: str, expected: bool) -> float:
    if not cases:
        return 0.0
    passed = sum(case[field] is expected for case in cases)
    return round(passed / len(cases), 6)


def evaluate_scores(cases: list[dict] | None = None) -> dict:
    """Parse and score each synthetic pair with the real production functions."""
    selected = cases if cases is not None else EVALUATION_CASES
    started = time.perf_counter()
    results: list[dict] = []

    for case in selected:
        expected = case["expected_score_range"]
        try:
            parsed_job = local_job(case["jd_text"])
            parsed_resume = local_resume(case["resume_text"])
            score_result = score_match(
                parsed_job["skills"],
                parsed_resume["skills"],
                case["resume_text"],
            )
            actual = float(score_result["score"])
            in_range = float(expected["min"]) <= actual <= float(expected["max"])
            results.append(
                {
                    "id": case["id"],
                    "category": case["category"],
                    "expected_min": float(expected["min"]),
                    "expected_max": float(expected["max"]),
                    "actual_score": actual,
                    "in_range": in_range,
                    "matched_skills": score_result["matched_skills"],
                    "missing_skills": score_result["missing_skills"],
                    "breakdown": score_result["breakdown"],
                }
            )
        except Exception as exc:  # Keep one malformed fixture from hiding other results.
            results.append(
                {
                    "id": case["id"],
                    "category": case["category"],
                    "expected_min": float(expected["min"]),
                    "expected_max": float(expected["max"]),
                    "actual_score": None,
                    "in_range": False,
                    "matched_skills": [],
                    "missing_skills": [],
                    "breakdown": [],
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )

    by_category: dict[str, list[dict]] = {}
    for result in results:
        by_category.setdefault(result["category"], []).append(result)

    return {
        "count": len(results),
        "accuracy": _accuracy(results, "in_range", True),
        "category_accuracy": {
            category: _accuracy(category_results, "in_range", True)
            for category, category_results in by_category.items()
        },
        "cases": results,
        "duration_seconds": time.perf_counter() - started,
    }


def _exact_baseline(requirement: str, resume_skill: str) -> bool:
    """Case-insensitive spelling equality, with no alias expansion."""
    return requirement.strip().casefold() == resume_skill.strip().casefold()


def evaluate_aliases() -> dict:
    """Compare production alias scoring with a strict exact-string baseline."""
    started = time.perf_counter()
    cases: list[dict] = []

    for case in [*_TRUE_ALIAS_CASES, *_DISTINCT_FRAMEWORK_CASES]:
        production = score_match(
            [{"name": case["requirement"], "required": True, "weight": 3.0}],
            [case["resume_skill"]],
            case["resume_text"],
        )
        production_matched = bool(production["matched_skills"])
        exact_matched = _exact_baseline(case["requirement"], case["resume_skill"])
        cases.append(
            {
                "pair_id": case["pair_id"],
                "requirement": case["requirement"],
                "resume_skill": case["resume_skill"],
                "should_match": case["should_match"],
                "production_matched": production_matched,
                "exact_baseline_matched": exact_matched,
                "correct": production_matched == case["should_match"],
            }
        )

    production_alias_accuracy = _accuracy(cases[: len(_TRUE_ALIAS_CASES)], "production_matched", True)
    exact_alias_accuracy = _accuracy(cases[: len(_TRUE_ALIAS_CASES)], "exact_baseline_matched", True)
    distinct_non_equivalence = _accuracy(cases[len(_TRUE_ALIAS_CASES) :], "production_matched", False)

    return {
        "true_alias_count": len(_TRUE_ALIAS_CASES),
        "distinct_framework_count": len(_DISTINCT_FRAMEWORK_CASES),
        "production_alias_accuracy": production_alias_accuracy,
        "exact_baseline_accuracy": exact_alias_accuracy,
        "alias_gain_over_exact": round(production_alias_accuracy - exact_alias_accuracy, 6),
        "distinct_framework_non_equivalence": distinct_non_equivalence,
        "cases": cases,
        "duration_seconds": time.perf_counter() - started,
    }


def _recall(hit_ids: list[str], relevant_ids: list[str]) -> float:
    if not relevant_ids:
        return 0.0
    found = set(hit_ids) & set(relevant_ids)
    return round(len(found) / len(set(relevant_ids)), 6)


def _mean(values: list[float]) -> float:
    return round(sum(values) / len(values), 6) if values else 0.0


def _component_helpers() -> tuple[Callable, Callable, Callable, Callable] | None:
    """Return current local retrieval helpers when they are actually available."""
    try:
        from app.rag.retriever import _cosine_scores, _material_text, _tokenize
    except ImportError:
        return None
    # BM25 has moved between module and class across revisions; accept either
    # actual implementation location and disable comparison if neither exists.
    bm25_scores = getattr(MaterialRetriever, "_bm25_scores", None)
    if bm25_scores is None:
        try:
            from app.rag.retriever import _bm25_scores as module_bm25_scores
        except ImportError:
            module_bm25_scores = None
        bm25_scores = module_bm25_scores
    helpers = (bm25_scores, _cosine_scores, _material_text, _tokenize)
    return helpers if all(callable(helper) for helper in helpers) else None


def evaluate_retrieval(
    cases: list[dict] | None = None,
    mode: str = "local",
    top_k: int = 3,
) -> dict:
    """Measure Recall@k against authored relevant IDs using the real retriever."""
    selected = cases if cases is not None else RETRIEVAL_CASES
    started = time.perf_counter()
    retriever = MaterialRetriever(mode=mode, persist_directory=_PERSIST_DIRECTORY)
    results: list[dict] = []
    bm25_recalls: list[float] = []
    sparse_recalls: list[float] = []
    helpers = _component_helpers() if retriever.mode == "local-hybrid" else None

    for case in selected:
        case_k = min(int(case.get("top_k", top_k)), int(top_k))
        hits = retriever.search(case["query"], case["materials"], top_k=case_k)
        hit_ids = [str(hit["id"]) for hit in hits]
        recall = _recall(hit_ids, case["relevant_ids"])
        result = {
            "id": case["id"],
            "query": case["query"],
            "relevant_ids": case["relevant_ids"],
            "top_k": case_k,
            "hit_ids": hit_ids,
            "recall_at_k": recall,
            "hits": hits,
        }

        if helpers is not None:
            bm25_scores, sparse_scores, material_text, tokenize = helpers
            material_tokens = [tokenize(material_text(material)) for material in case["materials"]]
            query_tokens = tokenize(case["query"])
            bm25_values = list(bm25_scores(query_tokens, material_tokens))
            sparse_values = list(sparse_scores(query_tokens, material_tokens))

            bm25_ids = [
                str(case["materials"][index]["id"])
                for index in sorted(
                    range(len(bm25_values)),
                    key=lambda i: (-bm25_values[i], i),
                )[:case_k]
                if bm25_values[index] > 0
            ]
            sparse_ids = [
                str(case["materials"][index]["id"])
                for index in sorted(
                    range(len(sparse_values)),
                    key=lambda i: (-sparse_values[i], i),
                )[:case_k]
                if sparse_values[index] > 0
            ]
            bm25_recall = _recall(bm25_ids, case["relevant_ids"])
            sparse_recall = _recall(sparse_ids, case["relevant_ids"])
            result["component_recall_at_k"] = {
                "bm25": bm25_recall,
                "sparse_vector": sparse_recall,
            }
            bm25_recalls.append(bm25_recall)
            sparse_recalls.append(sparse_recall)

        results.append(result)

    recalls = [result["recall_at_k"] for result in results]
    metrics = {"hybrid": {"count": len(results), "mean_recall_at_k": _mean(recalls)}}
    if helpers is not None:
        metrics["bm25"] = {"count": len(results), "mean_recall_at_k": _mean(bm25_recalls)}
        metrics["sparse_vector"] = {"count": len(results), "mean_recall_at_k": _mean(sparse_recalls)}

    return {
        "mode": retriever.mode,
        "count": len(results),
        "top_k": top_k,
        "mean_recall_at_k": _mean(recalls),
        "component_comparison_available": helpers is not None,
        "metrics": metrics,
        "cases": results,
        "duration_seconds": time.perf_counter() - started,
    }
