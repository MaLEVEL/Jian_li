"""Grounding regressions for model metadata and analysis advice."""

import pytest
from app.config import Settings
from app.graph import run_analysis
from app.nodes.parsers import grounded_job, grounded_resume
from app.rag import MaterialRetriever
from app.schemas import (
    AdviceItem,
    AdvicePayload,
    AnalyzeRequest,
    JobParsed,
    ResumeParsed,
    Skill,
)
from app.store import Store


def test_model_metadata_without_source_text_is_removed_and_positive_metadata_is_kept():
    unsupported_job = JobParsed(
        skills=[Skill(name="Python", required=True, weight=3.0)],
        experience_years=55.0,
        domain="unsupported-domain",
    )
    grounded = grounded_job(unsupported_job, "Python required")
    assert grounded["experience_years"] is None
    assert grounded["domain"] == ""

    supported_job = JobParsed(
        skills=[Skill(name="Python", required=True, weight=3.0)],
        experience_years=3.0,
        domain="金融风控",
    )
    grounded = grounded_job(supported_job, "金融风控岗位要求 Python，3 年经验。")
    assert grounded["experience_years"] == 3.0
    assert grounded["domain"] == "金融风控"

    unsupported_resume = ResumeParsed(skills=["Python"], experience_years=55.0, projects=["Python"])
    grounded = grounded_resume(unsupported_resume, "Python project")
    assert grounded["experience_years"] is None

    supported_resume = ResumeParsed(skills=["Python"], experience_years=3.0, projects=["Python 项目"])
    grounded = grounded_resume(supported_resume, "Python 项目；3 年开发经验。")
    assert grounded["experience_years"] == 3.0
    assert grounded["projects"] == ["Python 项目"]


def _online_model(material, advice, grounded_metadata=False):
    async def complete(*args, **kwargs):
        schema = args[3] if len(args) > 3 else kwargs.get("schema")
        if schema is JobParsed:
            return JobParsed(
                skills=[
                    Skill(name="Python", required=True, weight=3.0),
                    Skill(name="Docker", required=True, weight=3.0),
                ],
                experience_years=3.0 if grounded_metadata else 55.0,
                domain="金融风控" if grounded_metadata else "unsupported-domain",
            )
        if schema is ResumeParsed:
            return ResumeParsed(
                skills=["Python"],
                experience_years=3.0 if grounded_metadata else 55.0,
                projects=["Python 项目"],
            )
        return advice

    return complete


@pytest.mark.asyncio
async def test_valid_evidence_id_does_not_keep_fabricated_metrics_and_metadata(tmp_path, monkeypatch):
    store = Store(tmp_path / "test.sqlite3")
    material = store.add_material(
        {
            "title": "真实容器经历",
            "content": "使用 Docker 打包课程项目，并编写镜像构建文档。",
            "tags": ["Docker"],
        }
    )
    fabricated = AdviceItem(
        skill="Docker",
        suggestion="候选人拥有 10 年 Docker 经验，负责 5000 台服务器并将吞吐量提升 900%。",
        evidence_ids=[material["id"]],
        supported=True,
        source_quote="使用 Docker 打包课程项目",
    )
    monkeypatch.setattr(
        "app.graph.ModelClient.complete",
        _online_model(material, AdvicePayload(advice=[fabricated])),
    )

    report = await run_analysis(
        AnalyzeRequest(resume_text="Python project", jd_text="Python and Docker required"),
        Settings(api_key="test-key", data_dir=tmp_path),
        store,
        MaterialRetriever(),
    )

    advice = report["advice"][0]
    assert advice["supported"] is True
    assert advice["evidence_ids"] == [material["id"]]
    assert "10 年" not in advice["suggestion"]
    assert "5000" not in advice["suggestion"]
    assert "900%" not in advice["suggestion"]
    assert any("未通过原文核验" in warning for warning in report["warnings"])
    assert report["mode"] == "degraded"
    assert report["jd"]["experience_years"] is None
    assert report["jd"]["domain"] == ""
    assert report["resume"]["experience_years"] is None
    assert store.analysis(report["id"]) == report


@pytest.mark.asyncio
async def test_verbatim_supported_material_quote_is_retained_without_degradation(tmp_path, monkeypatch):
    store = Store(tmp_path / "test.sqlite3")
    material = store.add_material(
        {
            "title": "真实容器经历",
            "content": "使用 Docker 打包课程项目，管理 12 台测试服务器。",
            "tags": ["Docker"],
        }
    )
    quoted = AdviceItem(
        skill="Docker",
        suggestion="使用 Docker 打包课程项目，管理 12 台测试服务器。",
        evidence_ids=[material["id"]],
        supported=True,
        source_quote="使用 Docker 打包课程项目，管理 12 台测试服务器。",
    )
    monkeypatch.setattr(
        "app.graph.ModelClient.complete",
        _online_model(material, AdvicePayload(advice=[quoted]), grounded_metadata=True),
    )

    report = await run_analysis(
        AnalyzeRequest(
            resume_text="Python 项目；3 年开发经验。", jd_text="金融风控岗位要求 Python 和 Docker，3 年经验。"
        ),
        Settings(api_key="test-key", data_dir=tmp_path),
        store,
        MaterialRetriever(),
    )

    advice = report["advice"][0]
    assert advice["supported"] is True
    assert "模型已核对摘录：使用 Docker 打包课程项目，管理 12 台测试服务器。" in advice["suggestion"]
    assert report["mode"] == "online"
    assert not any("未通过原文核验" in warning for warning in report["warnings"])
