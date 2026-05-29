from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

ApplicationStatus = Literal[
    "saved",
    "applied",
    "screening",
    "interviewing",
    "offer",
    "rejected",
]


class ResumeRead(BaseModel):
    id: int
    filename: str
    text: str
    content_hash: str
    created_at: datetime


class JobCreate(BaseModel):
    company: str
    title: str
    description: str

    @field_validator("company", "title", "description")
    @classmethod
    def required_text(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("field cannot be empty")
        return value.strip()


class JobRead(BaseModel):
    id: int
    company: str
    title: str
    description: str
    created_at: datetime


class AnalysisCreate(BaseModel):
    resume_id: int
    job_id: int
    force: bool = False
    replace_existing: bool = False


class AnalysisRead(BaseModel):
    id: int
    resume_id: int
    job_id: int
    match_score: int = Field(ge=0, le=100)
    strengths: list[str]
    gaps: list[str]
    suggestions: list[str]
    optimized_bullets: list[str]
    created_at: datetime


class ApplicationRead(BaseModel):
    id: int
    resume_id: int
    job_id: int
    status: ApplicationStatus
    created_at: datetime
    updated_at: datetime
    resume: ResumeRead
    job: JobRead
    latest_analysis: AnalysisRead | None
    latest_interview_questions: "InterviewQuestionsRecordRead | None"


class ApplicationPageRead(BaseModel):
    items: list[ApplicationRead]
    page: int
    page_size: int
    total: int
    total_pages: int


class ApplicationStatusUpdate(BaseModel):
    status: ApplicationStatus


class InterviewQuestionsCreate(BaseModel):
    resume_id: int
    job_id: int


class InterviewQuestionsRead(BaseModel):
    technical: list[str]
    project: list[str]
    behavioral: list[str]


class InterviewQuestionsRecordRead(InterviewQuestionsRead):
    id: int
    resume_id: int
    job_id: int
    created_at: datetime


class HealthRead(BaseModel):
    status: str
