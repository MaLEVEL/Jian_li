from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

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
