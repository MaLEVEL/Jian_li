import json
import re
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    UrlConstraints,
    field_validator,
    model_validator,
)

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30000)]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Skill(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    required: bool = True
    weight: float = Field(default=3, gt=0, le=3)


class JobParsed(BaseModel):
    skills: list[Skill] = Field(default_factory=list, max_length=80)
    experience_years: float | None = Field(default=None, ge=0, le=60)
    domain: str = Field(default="", max_length=200)


class ResumeParsed(BaseModel):
    skills: list[str] = Field(default_factory=list, max_length=100)
    experience_years: float | None = Field(default=None, ge=0, le=60)
    projects: list[str] = Field(default_factory=list, max_length=50)


class AnalyzeRequest(InputModel):
    resume_text: Text
    jd_text: Text
    company: str = Field(default="", max_length=160)
    title: str = Field(default="", max_length=160)


class JobInput(InputModel):
    company: str = Field(default="", max_length=160)
    title: str = Field(default="", max_length=160)
    jd_text: Text


class BatchRequest(InputModel):
    resume_text: Text
    jobs: list[JobInput] = Field(min_length=1, max_length=20)


class MaterialInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=160)
    content: Text
    tags: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, tags: list[str]) -> list[str]:
        if any(not tag.strip() or len(tag) > 60 for tag in tags):
            raise ValueError("标签必须为 1–60 个字符")
        return list(dict.fromkeys(tag.strip() for tag in tags))


class AdviceItem(BaseModel):
    skill: str
    suggestion: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[str] = Field(default_factory=list)
    supported: bool = False
    source_quote: str = Field(default="", max_length=2000)


class AdvicePayload(BaseModel):
    advice: list[AdviceItem] = Field(max_length=20)


class SkillDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=500)
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")


class SkillRunRequest(InputModel):
    analysis_id: str = Field(min_length=1, max_length=64)


class SkillRunSource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=50000)


class ModelSkillItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    heading: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=4000)
    kind: Literal["fact", "proposal", "study", "question"]
    source_ids: list[str] = Field(default_factory=list, max_length=10)
    source_quote: str = Field(default="", max_length=2000)
    review_required: bool = False


class ModelSkillSection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=200)
    items: list[ModelSkillItem] = Field(default_factory=list, max_length=20)


class SkillPayload(BaseModel):
    sections: list[ModelSkillSection] = Field(default_factory=list, max_length=8)


class SkillRunItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    heading: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=4000)
    kind: Literal["fact", "proposal", "study", "question"]
    source_ids: list[str] = Field(default_factory=list, max_length=10)
    review_required: bool = False


class SkillRunSection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=200)
    items: list[SkillRunItem] = Field(default_factory=list, max_length=20)


class SkillRunResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=64)
    skill_id: str = Field(min_length=1, max_length=80)
    skill_name: str = Field(min_length=1, max_length=120)
    skill_version: str = Field(min_length=5, max_length=20)
    analysis_id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=240)
    mode: Literal["offline", "online", "degraded"]
    model: str = Field(min_length=1, max_length=200)
    warnings: list[str] = Field(default_factory=list, max_length=20)
    duration_ms: float = Field(ge=0)
    usage: dict[str, int]
    created_at: str
    sections: list[SkillRunSection] = Field(default_factory=list, max_length=12)
    sources: list[SkillRunSource] = Field(default_factory=list, max_length=30)


BossSourceUrl = Annotated[
    AnyHttpUrl,
    UrlConstraints(allowed_schemes=["http", "https"], max_length=2048),
]


class BossJobInput(InputModel):
    source: Literal["boss"] = "boss"
    source_job_id: str = Field(min_length=1, max_length=128)
    source_url: BossSourceUrl
    company: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=300)
    location: str = Field(default="", max_length=200)
    salary: str = Field(default="", max_length=120)
    experience: str = Field(default="", max_length=120)
    education: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=50000)
    recruiter_name: str = Field(default="", max_length=120)
    recruiter_title: str = Field(default="", max_length=200)
    tags: list[str] = Field(default_factory=list, max_length=30)
    fetched_at: datetime

    @field_validator("source_url")
    @classmethod
    def validate_boss_url(cls, value: AnyHttpUrl) -> AnyHttpUrl:
        host = (value.host or "").lower()
        if host != "zhipin.com" and not host.endswith(".zhipin.com"):
            raise ValueError("来源链接必须属于 zhipin.com")
        if value.username is not None or value.password is not None:
            raise ValueError("来源链接不能包含凭据")
        return value

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, tags: list[str]) -> list[str]:
        if any(not tag.strip() or len(tag.strip()) > 60 for tag in tags):
            raise ValueError("标签必须为 1–60 个字符")
        return list(dict.fromkeys(tag.strip() for tag in tags))


class BossJobBatchInput(InputModel):
    jobs: list[BossJobInput] = Field(min_length=1, max_length=50)


class BossJobRecord(BossJobInput):
    id: str = Field(min_length=1, max_length=64)
    created_at: datetime
    updated_at: datetime


class BossJobImportResult(BaseModel):
    imported: int = Field(ge=0)
    updated: int = Field(ge=0)
    total: int = Field(ge=0)


WORKSPACE_MAX_STATE_BYTES = 2 * 1024 * 1024
_WORKSPACE_PROVIDER_KEY_PARTS = ('apikey', 'baseurl', 'apitoken', 'accesstoken')
_WORKSPACE_PROVIDER_KEYS = {'authorization', 'bearer', 'llmmode', 'apiendpoint', 'providercredentials'}
_WORKSPACE_SECRET_VALUE = re.compile(r'(?i)(?:\bsk-[a-z0-9_-]{8,}|\bbearer\s+[a-z0-9._-]{12,}|\b[a-z0-9_-]{20,}\.[a-z0-9_-]{10,}\b)')


def _contains_provider_config(value: Any) -> bool:
    if isinstance(value, dict):
        for key, nested in value.items():
            normalized = re.sub(r'[^a-z0-9]', '', str(key).casefold())
            if (
                any(part in normalized for part in _WORKSPACE_PROVIDER_KEY_PARTS)
                or normalized.startswith('provider')
                or normalized in _WORKSPACE_PROVIDER_KEYS
            ):
                return True
            if _contains_provider_config(nested):
                return True
    elif isinstance(value, list):
        return any(_contains_provider_config(item) for item in value)
    elif isinstance(value, str):
        return bool(_WORKSPACE_SECRET_VALUE.search(value))
    return False


class WorkspaceModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class WorkspaceProfile(WorkspaceModel):
    name: str = Field(max_length=300)
    email: str = Field(max_length=320)
    phone: str = Field(max_length=100)
    location: str = Field(max_length=300)
    targetRole: str = Field(max_length=300)
    headline: str = Field(max_length=1000)
    education: str = Field(max_length=20000)
    skills: str = Field(max_length=20000)
    projects: str = Field(max_length=50000)
    experience: str = Field(max_length=50000)
    awards: str = Field(max_length=20000)


class WorkspaceResumeIdentity(WorkspaceModel):
    name: str = Field(max_length=300)
    email: str = Field(max_length=320)
    phone: str = Field(max_length=100)
    location: str = Field(max_length=300)


class WorkspaceResumeSections(WorkspaceModel):
    summary: str = Field(max_length=50000)
    skills: list[str] = Field(max_length=500)
    education: list[str] = Field(max_length=200)
    projects: list[str] = Field(max_length=200)
    experience: list[str] = Field(max_length=200)
    awards: list[str] = Field(max_length=200)


class WorkspaceResumeAppearance(WorkspaceModel):
    fontFamily: Literal['sans', 'serif', 'editorial']
    fontSize: float = Field(ge=1, le=72)
    lineHeight: float = Field(ge=0.5, le=5)
    pageMargin: float = Field(ge=0, le=100)
    pageCount: Literal[1, 2]
    accent: str | None = Field(default=None, max_length=100)


class WorkspaceResume(WorkspaceModel):
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=300)
    source: Literal['generated', 'optimized', 'uploaded']
    template: Literal[
        'graduate',
        'graduate-research',
        'internship',
        'internship-project',
        'experienced',
        'experienced-specialist',
        'technical',
        'technical-timeline',
        'sidebar',
        'operations-impact',
        'editorial',
        'design-portfolio',
        'management',
        'consulting',
        'academic',
        'academic-compact',
    ]
    identity: WorkspaceResumeIdentity | None = None
    targetRole: str = Field(max_length=300)
    company: str | None = Field(default=None, max_length=300)
    jobTitle: str | None = Field(default=None, max_length=300)
    parentResumeId: str | None = Field(default=None, max_length=128)
    appearance: WorkspaceResumeAppearance | None = None
    sections: WorkspaceResumeSections
    plainText: str = Field(max_length=WORKSPACE_MAX_STATE_BYTES)
    unsupportedClaims: list[str] = Field(max_length=500)
    reviewed: bool
    createdAt: str = Field(min_length=1, max_length=100)
    updatedAt: str = Field(min_length=1, max_length=100)


class WorkspaceJob(WorkspaceModel):
    company: str = Field(max_length=300)
    title: str = Field(max_length=300)
    description: str = Field(max_length=100000)


class WorkspaceMatchReport(WorkspaceModel):
    score: float = Field(ge=0, le=100)
    weightedCoverage: float = Field(ge=0, le=100)
    skillCoverage: float = Field(ge=0, le=100)
    projectCoverage: float = Field(ge=0, le=100)
    matchedKeywords: list[str] = Field(max_length=500)
    missingKeywords: list[str] = Field(max_length=500)
    scoreBreakdown: list[str] = Field(max_length=100)
    strengths: list[str] = Field(max_length=200)
    gaps: list[str] = Field(max_length=200)
    suggestions: list[str] = Field(max_length=200)
    optimizedBullets: list[str] = Field(max_length=200)


class WorkspaceInterviewQuestions(WorkspaceModel):
    technical: list[str] = Field(max_length=200)
    project: list[str] = Field(max_length=200)
    behavioral: list[str] = Field(max_length=200)


class WorkspaceApplication(WorkspaceModel):
    id: str = Field(min_length=1, max_length=128)
    job: WorkspaceJob
    status: Literal['saved', 'applied', 'screening', 'interviewing', 'offer', 'rejected']
    appliedAt: str = Field(max_length=100)
    channel: str = Field(max_length=300)
    hrContact: str = Field(max_length=1000)
    followUpAt: str = Field(max_length=100)
    interviewAt: str = Field(max_length=100)
    notes: str = Field(max_length=100000)
    resumeId: str = Field(max_length=128)
    resumeTitle: str = Field(max_length=300)
    report: WorkspaceMatchReport
    questions: WorkspaceInterviewQuestions
    createdAt: str = Field(min_length=1, max_length=100)
    updatedAt: str = Field(min_length=1, max_length=100)


class WorkspaceState(WorkspaceModel):
    profile: WorkspaceProfile
    resumes: list[WorkspaceResume] = Field(default_factory=list, max_length=100)
    applications: list[WorkspaceApplication] = Field(default_factory=list, max_length=1000)
    version: Literal[1]
    exportedAt: str | None = Field(default=None, max_length=100)

    @model_validator(mode='after')
    def validate_workspace_state(self):
        if _contains_provider_config(self.model_dump(mode='json')):
            raise ValueError('工作区状态不能包含 provider/API 凭据配置')
        serialized = json.dumps(
            self.model_dump(mode='json'), ensure_ascii=False, separators=(',', ':')
        ).encode('utf-8')
        if len(serialized) > WORKSPACE_MAX_STATE_BYTES:
            raise ValueError('工作区状态序列化后不能超过 2MB')
        return self


class WorkspacePutRequest(InputModel):
    state: WorkspaceState
    expected_revision: int | None = Field(default=None, ge=0)


class WorkspaceEnvelope(BaseModel):
    state: WorkspaceState
    updated_at: str
    revision: int = Field(ge=1)
