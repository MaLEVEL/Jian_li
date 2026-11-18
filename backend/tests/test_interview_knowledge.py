"""Tests for concrete interview knowledge cards."""

import pytest
from app.business_skills.knowledge import interview_card


@pytest.mark.parametrize(
    "skill",
    [
        "Python",
        "FastAPI",
        "asyncio",
        "Docker",
        "SQL",
        "PostgreSQL",
        "RAG",
        "LangGraph",
        "pytest",
    ],
)
def test_common_skills_return_complete_concrete_interview_cards(skill):
    card = interview_card(skill)

    assert set(card) == {"concepts", "practice", "question", "answer", "follow_up"}
    assert all(isinstance(value, str) and value.strip() for value in card.values())


def test_cards_contain_specific_checklists_rather_than_generic_advice():
    assert {"镜像", "卷", "网络"} <= set(interview_card("Docker")["concepts"].split("；"))
    fastapi = interview_card("FastAPI")["concepts"]
    assert "依赖注入" in fastapi and "校验" in fastapi
    rag = interview_card("RAG")["concepts"]
    assert "召回" in rag and "重排" in rag

    sql_answer = interview_card("SQL")["answer"]
    assert "执行计划" in sql_answer and "索引" in sql_answer


def test_interview_cards_are_actionable_and_include_follow_ups():
    for skill in ("Python", "FastAPI", "asyncio", "Docker", "SQL", "PostgreSQL", "RAG", "LangGraph", "pytest"):
        card = interview_card(skill)
        assert "实践" in card["practice"] or "实现" in card["practice"] or "写" in card["practice"]
        assert "回答要点" not in card["answer"].lower()
        assert card["follow_up"].strip().endswith("？")


def test_known_aliases_use_canonical_interview_cards():
    assert interview_card("postgres") == interview_card("PostgreSQL")
    assert interview_card("python3") == interview_card("Python")
    assert interview_card("pytorch") == interview_card("PyTorch")


def test_unknown_skill_uses_clear_fallback_template():
    card = interview_card("Quantum Workflow Fabric")

    assert set(card) == {"concepts", "practice", "question", "answer", "follow_up"}
    assert "未收录" in card["concepts"]
    assert "最小可运行示例" in card["practice"]
    assert "官方文档" in card["follow_up"]


def test_returned_card_is_a_copy():
    mutated = "mutated for copy safety"
    first = interview_card("Python")
    first["concepts"] = mutated
    assert interview_card("Python")["concepts"] != mutated
