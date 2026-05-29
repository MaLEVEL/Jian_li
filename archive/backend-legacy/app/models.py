from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, UniqueConstraint
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Resume(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    text: str
    content_hash: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)


class Job(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    company: str = ""
    title: str = ""
    description: str
    created_at: datetime = Field(default_factory=utc_now, nullable=False)


class Application(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("resume_id", "job_id", name="uq_application_resume_job"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    resume_id: int = Field(foreign_key="resume.id", index=True)
    job_id: int = Field(foreign_key="job.id", index=True)
    status: str = Field(default="saved")
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)


class Analysis(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    resume_id: int = Field(foreign_key="resume.id", index=True)
    job_id: int = Field(foreign_key="job.id", index=True)
    application_id: int = Field(foreign_key="application.id", index=True)
    match_score: int = Field(ge=0, le=100)
    strengths: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    gaps: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    suggestions: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    optimized_bullets: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now, nullable=False)


class InterviewQuestionSet(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    resume_id: int = Field(foreign_key="resume.id", index=True)
    job_id: int = Field(foreign_key="job.id", index=True)
    application_id: int = Field(foreign_key="application.id", index=True)
    technical: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    project: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    behavioral: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
