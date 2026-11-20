import base64
import binascii
import json
import re
from datetime import datetime
from io import BytesIO
from typing import Annotated, Any, Literal
from urllib.parse import parse_qsl, urlsplit

from PIL import Image, UnidentifiedImageError
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
WORKSPACE_MAX_PHOTO_CHARS = 210_000
WORKSPACE_MAX_PHOTO_BYTES = 150 * 1024
WORKSPACE_MAX_TOTAL_PHOTO_CHARS = 1_200_000
_RESUME_PHOTO_DATA_URL = re.compile(r'^data:image/jpeg;base64,([A-Za-z0-9+/]+={0,2})$')
ResumePhotoPosition = Literal['left', 'right']
_WORKSPACE_PROVIDER_KEY_PARTS = ('apikey', 'baseurl', 'apitoken', 'accesstoken')
_WORKSPACE_PROVIDER_KEYS = {'authorization', 'bearer', 'llmmode', 'apiendpoint', 'providercredentials'}
_WORKSPACE_SECRET_VALUE = re.compile(r'(?i)(?:\bsk-[a-z0-9_-]{8,}|\bbearer\s+[a-z0-9._-]{12,}|\b[a-z0-9_-]{20,}\.[a-z0-9_-]{10,}\b)')


def _is_provider_config_key(key: Any) -> bool:
    normalized = re.sub(r'[^a-z0-9]', '', str(key).casefold())
    return (
        any(part in normalized for part in _WORKSPACE_PROVIDER_KEY_PARTS)
        or normalized.startswith('provider')
        or normalized in _WORKSPACE_PROVIDER_KEYS
    )


def _url_contains_credentials(value: str) -> bool:
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    if not parsed.scheme or not parsed.netloc:
        return False
    if parsed.username is not None or parsed.password is not None:
        return True
    return any(
        _is_provider_config_key(key)
        for key, _ in parse_qsl(parsed.query, keep_blank_values=True)
    )


def _contains_provider_config(value: Any) -> bool:
    if isinstance(value, dict):
        for key, nested in value.items():
            if _is_provider_config_key(key) or _contains_provider_config(nested):
                return True
    elif isinstance(value, list):
        return any(_contains_provider_config(item) for item in value)
    elif isinstance(value, str):
        return bool(_WORKSPACE_SECRET_VALUE.search(value)) or _url_contains_credentials(value)
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


def _validate_jpeg_photo(data: bytes) -> tuple[int, int]:
    if len(data) < 32 or data[:3] != b'\xff\xd8\xff' or data[-2:] != b'\xff\xd9':
        raise ValueError('照片必须是完整的 JPEG 数据')
    position = 2
    dimensions: tuple[int, int] | None = None
    sof_markers = {
        0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
        0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
    }
    while position < len(data) - 2:
        if data[position] != 0xFF:
            raise ValueError('JPEG 段结构不合法')
        while position < len(data) and data[position] == 0xFF:
            position += 1
        if position >= len(data):
            break
        marker = data[position]
        position += 1
        if marker in (0x00, 0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            continue
        if position + 2 > len(data):
            raise ValueError('JPEG 段长度不完整')
        segment_length = int.from_bytes(data[position:position + 2], 'big')
        if segment_length < 2 or position + segment_length > len(data):
            raise ValueError('JPEG 段长度不合法')
        segment = data[position + 2:position + segment_length]
        if marker == 0xE1:
            raise ValueError('照片不能包含 EXIF/XMP 元数据')
        if marker in sof_markers:
            if len(segment) < 5:
                raise ValueError('JPEG 尺寸信息不完整')
            height = int.from_bytes(segment[1:3], 'big')
            width = int.from_bytes(segment[3:5], 'big')
            dimensions = (width, height)
        if marker == 0xDA:
            entropy_bytes = len(data) - (position + segment_length) - 2
            if entropy_bytes < 64:
                raise ValueError('JPEG 图像扫描数据不完整')
            break
        position += segment_length
    if dimensions is None:
        raise ValueError('JPEG 缺少尺寸信息')
    width, height = dimensions
    if width < 180 or height < 240 or width > 3000 or height > 3000:
        raise ValueError('照片尺寸必须在 180x240 到 3000x3000 之间')
    if abs(width * 4 - height * 3) > max(4, round(height * 0.06)):
        raise ValueError('照片比例必须接近 3:4')
    try:
        with Image.open(BytesIO(data)) as image:
            if image.format != 'JPEG':
                raise ValueError('照片必须是 JPEG 数据')
            image.verify()
        with Image.open(BytesIO(data)) as image:
            image.load()
            if image.size != (width, height):
                raise ValueError('JPEG 尺寸信息不一致')
            if image.getexif():
                raise ValueError('照片不能包含 EXIF/XMP 元数据')
            if 'exif' in image.info or 'xmp' in image.info:
                raise ValueError('照片不能包含 EXIF/XMP 元数据')
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as error:
        raise ValueError('JPEG 无法完整解码') from error
    return width, height


class WorkspaceResumeAppearance(WorkspaceModel):
    fontFamily: Literal['sans', 'serif', 'editorial']
    fontSize: float = Field(ge=1, le=72)
    lineHeight: float = Field(ge=0.5, le=5)
    pageMargin: float = Field(ge=0, le=100)
    pageCount: Literal[1, 2]
    accent: str | None = Field(default=None, max_length=100)
    photoDataUrl: str | None = Field(
        default=None,
        max_length=WORKSPACE_MAX_PHOTO_CHARS,
        exclude_if=lambda value: value is None,
    )
    photoPosition: ResumePhotoPosition | None = Field(default=None, exclude_if=lambda value: value is None)

    @field_validator('photoDataUrl')
    @classmethod
    def validate_photo_data_url(cls, value: str | None) -> str | None:
        if value is None:
            return value
        match = _RESUME_PHOTO_DATA_URL.fullmatch(value)
        if not match:
            raise ValueError('照片必须是 JPEG data URL')
        encoded = match.group(1)
        if len(encoded) % 4:
            raise ValueError('照片 Base64 长度不合法')
        try:
            decoded = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error) as error:
            raise ValueError('照片 Base64 不合法') from error
        if not decoded:
            raise ValueError('照片内容不能为空')
        if len(decoded) > WORKSPACE_MAX_PHOTO_BYTES:
            raise ValueError('照片不能超过 150KB')
        _validate_jpeg_photo(decoded)
        return value

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


OpportunityStage = Literal[
    'new',
    'saved',
    'tailoring',
    'applied',
    'communicating',
    'interviewing',
    'offer',
    'unsuitable',
    'closed',
]
JobSource = Literal['workspace', 'boss', 'manual', 'csv']


class WorkspaceNextAction(WorkspaceModel):
    id: str = Field(min_length=1, max_length=128)
    kind: Literal[
        'follow-up',
        'tailor-resume',
        'prepare-interview',
        'review',
        'compare-offer',
    ]
    title: str = Field(min_length=1, max_length=300)
    dueAt: str = Field(min_length=1, max_length=100)
    completedAt: str | None = Field(default=None, max_length=100)
    createdAt: str = Field(min_length=1, max_length=100)


class WorkspaceJob(WorkspaceModel):
    company: str = Field(max_length=300)
    title: str = Field(max_length=300)
    description: str = Field(max_length=100000)
    location: str | None = Field(
        default=None,
        max_length=300,
        exclude_if=lambda value: value is None,
    )
    salary: str | None = Field(
        default=None,
        max_length=120,
        exclude_if=lambda value: value is None,
    )
    source: JobSource | None = Field(default=None, exclude_if=lambda value: value is None)
    sourceJobId: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        exclude_if=lambda value: value is None,
    )
    sourceUrl: BossSourceUrl | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )

    @field_validator('sourceUrl')
    @classmethod
    def validate_source_url(cls, value: AnyHttpUrl | None) -> AnyHttpUrl | None:
        if value is None:
            return value
        if value.username is not None or value.password is not None:
            raise ValueError('来源链接不能包含凭据')
        return value


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
    nextAction: WorkspaceNextAction | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )
    stageChangedAt: str | None = Field(
        default=None,
        max_length=100,
        exclude_if=lambda value: value is None,
    )


class WorkspaceOpportunity(WorkspaceModel):
    id: str = Field(min_length=1, max_length=128)
    job: WorkspaceJob
    stage: OpportunityStage
    nextAction: WorkspaceNextAction | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )
    source: JobSource
    sourceJobId: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        exclude_if=lambda value: value is None,
    )
    sourceUrl: BossSourceUrl | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )
    sourceKey: str | None = Field(
        default=None,
        min_length=8,
        max_length=256,
        exclude_if=lambda value: value is None,
    )
    blacklistedAt: str | None = Field(
        default=None,
        max_length=100,
        exclude_if=lambda value: value is None,
    )
    blacklistReason: str | None = Field(
        default=None,
        max_length=1000,
        exclude_if=lambda value: value is None,
    )
    channel: str = Field(default='', max_length=300)
    contact: str = Field(default='', max_length=1000)
    notes: str = Field(default='', max_length=100000)
    applicationId: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        exclude_if=lambda value: value is None,
    )
    resumeId: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        exclude_if=lambda value: value is None,
    )
    createdAt: str = Field(min_length=1, max_length=100)
    updatedAt: str = Field(min_length=1, max_length=100)
    stageChangedAt: str | None = Field(
        default=None,
        max_length=100,
        exclude_if=lambda value: value is None,
    )

    @field_validator('sourceUrl')
    @classmethod
    def validate_source_url(cls, value: AnyHttpUrl | None) -> AnyHttpUrl | None:
        if value is None:
            return value
        if value.username is not None or value.password is not None:
            raise ValueError('来源链接不能包含凭据')
        return value


class WorkspaceSavedJobView(WorkspaceModel):
    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=300)
    query: str | None = Field(
        default=None,
        max_length=1000,
        exclude_if=lambda value: value is None,
    )
    stages: list[OpportunityStage] | None = Field(
        default=None,
        max_length=9,
        exclude_if=lambda value: value is None,
    )
    source: JobSource | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )


class WorkspaceJobPool(WorkspaceModel):
    savedViews: list[WorkspaceSavedJobView] = Field(default_factory=list, max_length=5)


class WorkspaceState(WorkspaceModel):
    profile: WorkspaceProfile
    resumes: list[WorkspaceResume] = Field(default_factory=list, max_length=100)
    applications: list[WorkspaceApplication] = Field(default_factory=list, max_length=1000)
    opportunities: list[WorkspaceOpportunity] | None = Field(
        default=None,
        max_length=1000,
        exclude_if=lambda value: value is None,
    )
    jobPool: WorkspaceJobPool | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )
    version: Literal[1]
    exportedAt: str | None = Field(default=None, max_length=100)

    @model_validator(mode='after')
    def validate_workspace_state(self):
        if _contains_provider_config(self.model_dump(mode='json')):
            raise ValueError('工作区状态不能包含 provider/API 凭据配置')
        total_photo_chars = sum(
            len(resume.appearance.photoDataUrl or '')
            for resume in self.resumes
            if resume.appearance
        )
        if total_photo_chars > WORKSPACE_MAX_TOTAL_PHOTO_CHARS:
            raise ValueError('所有简历照片总量超过 1.2M 字符预算')
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
