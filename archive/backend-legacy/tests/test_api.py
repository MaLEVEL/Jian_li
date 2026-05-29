import asyncio
import json
import sys
from pathlib import Path

import httpx
import pytest
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.database import enable_sqlite_foreign_keys, get_session
from app.main import app
from app.models import Analysis, Application, Resume
from app.services.ai_client import AIClient


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    event.listen(engine, "connect", enable_sqlite_foreign_keys)
    SQLModel.metadata.create_all(engine)

    def override_get_session():
        with Session(engine) as session:
            yield session

    app.state.skip_db_init = True
    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as test_client:
        test_client.engine = engine
        yield test_client
    app.dependency_overrides.clear()
    app.state.skip_db_init = False


def test_health_check(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_upload_txt_resume(client):
    response = client.post(
        "/api/resumes",
        files={"file": ("resume.txt", b"Python FastAPI SQLite", "text/plain")},
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["filename"] == "resume.txt"
    assert payload["text"] == "Python FastAPI SQLite"
    assert len(payload["content_hash"]) == 64
    assert payload["id"] == 1


def test_rejects_binary_file_disguised_as_txt(client):
    response = client.post(
        "/api/resumes",
        files={
            "file": (
                "resume.txt",
                b"SQLite format 3\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0e\x0f",
                "text/plain",
            )
        },
    )

    assert response.status_code == 400
    assert "readable text" in response.json()["detail"]


def test_rejects_resume_over_size_limit(client):
    large_text = b"A" * (2 * 1024 * 1024 + 1)

    response = client.post(
        "/api/resumes",
        files={"file": ("resume.txt", large_text, "text/plain")},
    )

    assert response.status_code == 413


def test_duplicate_resume_upload_reuses_existing_record(client):
    files = {"file": ("resume.txt", b"Python FastAPI SQLite", "text/plain")}
    first = client.post("/api/resumes", files=files).json()
    second = client.post(
        "/api/resumes",
        files={"file": ("another-name.txt", b"Python FastAPI SQLite", "text/plain")},
    ).json()

    assert second["id"] == first["id"]
    assert second["content_hash"] == first["content_hash"]
    with Session(client.engine) as session:
        assert len(session.exec(select(Resume)).all()) == 1


def test_empty_job_description_error(client):
    response = client.post(
        "/api/jobs",
        json={"company": "Acme", "title": "Backend Engineer", "description": "   "},
    )
    assert response.status_code == 422


def test_empty_job_company_and_title_error(client):
    missing_company = client.post(
        "/api/jobs",
        json={
            "company": "   ",
            "title": "Backend Engineer",
            "description": "Need Python",
        },
    )
    missing_title = client.post(
        "/api/jobs",
        json={
            "company": "JobFit",
            "title": "",
            "description": "Need Python",
        },
    )

    assert missing_company.status_code == 422
    assert missing_title.status_code == 422


def test_update_job(client):
    create_response = client.post(
        "/api/jobs",
        json={
            "company": "Old Co",
            "title": "Old Role",
            "description": "Old description",
        },
    )

    response = client.put(
        f"/api/jobs/{create_response.json()['id']}",
        json={
            "company": "New Co",
            "title": "New Role",
            "description": "New description",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["company"] == "New Co"
    assert payload["title"] == "New Role"
    assert payload["description"] == "New description"


def test_sqlite_foreign_keys_are_enforced(client):
    with Session(client.engine) as session:
        session.add(Application(resume_id=999, job_id=999, status="saved"))
        with pytest.raises(IntegrityError):
            session.commit()


def test_application_resume_job_pair_is_unique(client):
    resume_response = client.post(
        "/api/resumes",
        files={"file": ("resume.txt", b"Python FastAPI", "text/plain")},
    )
    job_response = client.post(
        "/api/jobs",
        json={
            "company": "JobFit",
            "title": "Backend Engineer",
            "description": "Need Python",
        },
    )

    with Session(client.engine) as session:
        session.add(
            Application(
                resume_id=resume_response.json()["id"],
                job_id=job_response.json()["id"],
                status="saved",
            )
        )
        session.add(
            Application(
                resume_id=resume_response.json()["id"],
                job_id=job_response.json()["id"],
                status="saved",
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()


def test_fallback_analysis_structure_without_api_key(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    resume_response = client.post(
        "/api/resumes",
        files={
            "file": (
                "resume.txt",
                b"Python FastAPI SQLite API testing backend",
                "text/plain",
            )
        },
    )
    job_response = client.post(
        "/api/jobs",
        json={
            "company": "JobFit",
            "title": "Backend Engineer",
            "description": "Need Python FastAPI SQLite backend API experience",
        },
    )

    response = client.post(
        "/api/analysis",
        json={
            "resume_id": resume_response.json()["id"],
            "job_id": job_response.json()["id"],
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["resume_id"] == resume_response.json()["id"]
    assert payload["job_id"] == job_response.json()["id"]
    assert isinstance(payload["match_score"], int)
    for key in ["strengths", "gaps", "suggestions", "optimized_bullets"]:
        assert isinstance(payload[key], list)
        assert payload[key]
        assert all(isinstance(item, str) for item in payload[key])


def test_recent_analysis_is_reused_by_default(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    resume_response = client.post(
        "/api/resumes",
        files={"file": ("resume.txt", b"Python FastAPI SQLite", "text/plain")},
    )
    job_response = client.post(
        "/api/jobs",
        json={
            "company": "JobFit",
            "title": "Backend Engineer",
            "description": "Need Python FastAPI SQLite",
        },
    )
    request_body = {
        "resume_id": resume_response.json()["id"],
        "job_id": job_response.json()["id"],
    }

    first = client.post("/api/analysis", json=request_body).json()
    second = client.post("/api/analysis", json=request_body).json()

    assert second["id"] == first["id"]
    with Session(client.engine) as session:
        assert len(session.exec(select(Analysis)).all()) == 1


def test_force_analysis_prunes_old_history(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    resume_response = client.post(
        "/api/resumes",
        files={"file": ("resume.txt", b"Python FastAPI SQLite", "text/plain")},
    )
    job_response = client.post(
        "/api/jobs",
        json={
            "company": "JobFit",
            "title": "Backend Engineer",
            "description": "Need Python FastAPI SQLite",
        },
    )
    request_body = {
        "resume_id": resume_response.json()["id"],
        "job_id": job_response.json()["id"],
        "force": True,
    }

    generated_ids = [
        client.post("/api/analysis", json=request_body).json()["id"]
        for _ in range(7)
    ]

    with Session(client.engine) as session:
        analyses = session.exec(select(Analysis).order_by(Analysis.id)).all()
        assert len(analyses) == 5
        assert [analysis.id for analysis in analyses] == generated_ids[-5:]


def test_replace_existing_analysis_keeps_only_new_result(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    resume_response = client.post(
        "/api/resumes",
        files={"file": ("resume.txt", b"Python FastAPI SQLite", "text/plain")},
    )
    job_response = client.post(
        "/api/jobs",
        json={
            "company": "JobFit",
            "title": "Backend Engineer",
            "description": "Need Python FastAPI SQLite",
        },
    )
    base_body = {
        "resume_id": resume_response.json()["id"],
        "job_id": job_response.json()["id"],
    }
    client.post("/api/analysis", json={**base_body, "force": True})
    client.post("/api/analysis", json={**base_body, "force": True})
    with Session(client.engine) as session:
        assert len(session.exec(select(Analysis)).all()) == 2

    new = client.post(
        "/api/analysis",
        json={**base_body, "replace_existing": True},
    ).json()

    with Session(client.engine) as session:
        analyses = session.exec(select(Analysis)).all()
        assert len(analyses) == 1
        assert analyses[0].id == new["id"]


def test_delete_analysis(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    resume_response = client.post(
        "/api/resumes",
        files={"file": ("resume.txt", b"Python FastAPI SQLite", "text/plain")},
    )
    job_response = client.post(
        "/api/jobs",
        json={
            "company": "JobFit",
            "title": "Backend Engineer",
            "description": "Need Python FastAPI SQLite",
        },
    )
    analysis = client.post(
        "/api/analysis",
        json={
            "resume_id": resume_response.json()["id"],
            "job_id": job_response.json()["id"],
        },
    ).json()

    response = client.delete(f"/api/analysis/{analysis['id']}")

    assert response.status_code == 204
    with Session(client.engine) as session:
        assert session.get(Analysis, analysis["id"]) is None


def test_delete_resume_cleans_dependent_records(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    resume_response = client.post(
        "/api/resumes",
        files={"file": ("resume.txt", b"Python FastAPI API", "text/plain")},
    )
    job_response = client.post(
        "/api/jobs",
        json={
            "company": "JobFit",
            "title": "Backend Engineer",
            "description": "Need Python FastAPI API",
        },
    )
    request_body = {
        "resume_id": resume_response.json()["id"],
        "job_id": job_response.json()["id"],
    }
    client.post("/api/analysis", json=request_body)
    client.post("/api/interview-questions", json=request_body)

    response = client.delete(f"/api/resumes/{resume_response.json()['id']}")

    assert response.status_code == 204
    assert client.get("/api/applications").json()["items"] == []
    with Session(client.engine) as session:
        assert session.get(Resume, resume_response.json()["id"]) is None
        assert session.exec(select(Application)).all() == []
        assert session.exec(select(Analysis)).all() == []


def test_delete_job_cleans_dependent_records(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    resume_response = client.post(
        "/api/resumes",
        files={"file": ("resume.txt", b"Python FastAPI API", "text/plain")},
    )
    job_response = client.post(
        "/api/jobs",
        json={
            "company": "JobFit",
            "title": "Backend Engineer",
            "description": "Need Python FastAPI API",
        },
    )
    request_body = {
        "resume_id": resume_response.json()["id"],
        "job_id": job_response.json()["id"],
    }
    client.post("/api/analysis", json=request_body)
    client.post("/api/interview-questions", json=request_body)

    response = client.delete(f"/api/jobs/{job_response.json()['id']}")

    assert response.status_code == 204
    assert client.get("/api/applications").json()["items"] == []


def test_applications_are_paginated(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    resume_response = client.post(
        "/api/resumes",
        files={"file": ("resume.txt", b"Python FastAPI API", "text/plain")},
    )
    resume_id = resume_response.json()["id"]
    for index in range(12):
        job_response = client.post(
            "/api/jobs",
            json={
                "company": f"JobFit {index}",
                "title": "Backend Engineer",
                "description": f"Need Python FastAPI API {index}",
            },
        )
        client.post(
            "/api/analysis",
            json={
                "resume_id": resume_id,
                "job_id": job_response.json()["id"],
            },
        )

    first_page = client.get("/api/applications?page=1&page_size=5").json()
    third_page = client.get("/api/applications?page=3&page_size=5").json()

    assert first_page["page"] == 1
    assert first_page["page_size"] == 5
    assert first_page["total"] == 12
    assert first_page["total_pages"] == 3
    assert len(first_page["items"]) == 5
    assert third_page["page"] == 3
    assert len(third_page["items"]) == 2


def test_invalid_application_status_is_rejected(client):
    resume_response = client.post(
        "/api/resumes",
        files={"file": ("resume.txt", b"Python FastAPI", "text/plain")},
    )
    job_response = client.post(
        "/api/jobs",
        json={
            "company": "JobFit",
            "title": "Backend Engineer",
            "description": "Need Python FastAPI experience",
        },
    )
    client.post(
        "/api/analysis",
        json={
            "resume_id": resume_response.json()["id"],
            "job_id": job_response.json()["id"],
        },
    )
    application_id = client.get("/api/applications").json()["items"][0]["id"]

    response = client.patch(
        f"/api/applications/{application_id}",
        json={"status": "invalid_status_xyz"},
    )

    assert response.status_code == 422
    application = client.get("/api/applications").json()["items"][0]
    assert application["status"] == "saved"


def test_interview_questions_are_persisted_on_application(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    resume_response = client.post(
        "/api/resumes",
        files={"file": ("resume.txt", b"Python FastAPI API", "text/plain")},
    )
    job_response = client.post(
        "/api/jobs",
        json={
            "company": "JobFit",
            "title": "Backend Engineer",
            "description": "Need Python FastAPI API experience",
        },
    )
    request_body = {
        "resume_id": resume_response.json()["id"],
        "job_id": job_response.json()["id"],
    }

    questions_response = client.post("/api/interview-questions", json=request_body)
    applications_response = client.get("/api/applications")

    assert questions_response.status_code == 200
    assert applications_response.status_code == 200
    questions = questions_response.json()
    application = applications_response.json()["items"][0]
    persisted_questions = application["latest_interview_questions"]
    assert persisted_questions is not None
    assert persisted_questions["technical"] == questions["technical"]
    assert persisted_questions["project"] == questions["project"]
    assert persisted_questions["behavioral"] == questions["behavioral"]


def test_ai_client_retries_transient_network_error(monkeypatch):
    attempts = {"count": 0}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "match_score": 80,
                                    "strengths": ["Python"],
                                    "gaps": ["PostgreSQL"],
                                    "suggestions": ["Add metrics"],
                                    "optimized_bullets": ["Built FastAPI APIs"],
                                }
                            )
                        }
                    }
                ]
            }

    class FakeAsyncClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def post(self, *args, **kwargs):
            attempts["count"] += 1
            if attempts["count"] == 1:
                raise httpx.ConnectError("temporary network issue")
            return FakeResponse()

    monkeypatch.setattr("app.services.ai_client.httpx.AsyncClient", FakeAsyncClient)
    client = AIClient(api_key="test-key", max_retries=1, timeout_seconds=1)
    payload = asyncio.run(client._chat_completion("test prompt"))

    assert attempts["count"] == 2
    assert payload["match_score"] == 80
