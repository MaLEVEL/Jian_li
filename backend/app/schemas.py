from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30000)]


class InputModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Skill(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    required: bool = True
    weight: float = Field(default=3, gt=0, le=3)


class JobParsed(BaseModel):
    skills: list[Skill] = Field(default_factory=list, max_length=80)
    experience_years: float | None = Field(default=None, ge=0, le=60)
    domain: str = Field(default='', max_length=200)


class ResumeParsed(BaseModel):
    skills: list[str] = Field(default_factory=list, max_length=100)
    experience_years: float | None = Field(default=None, ge=0, le=60)
    projects: list[str] = Field(default_factory=list, max_length=50)


class AnalyzeRequest(InputModel):
    resume_text: Text
    jd_text: Text
    company: str = Field(default='', max_length=160)
    title: str = Field(default='', max_length=160)


class JobInput(InputModel):
    company: str = Field(default='', max_length=160)
    title: str = Field(default='', max_length=160)
    jd_text: Text


class BatchRequest(InputModel):
    resume_text: Text
    jobs: list[JobInput] = Field(min_length=1, max_length=20)


class MaterialInput(InputModel):
    title: str = Field(min_length=1, max_length=160)
    content: Text
    tags: list[str] = Field(default_factory=list, max_length=20)

    @field_validator('tags')
    @classmethod
    def clean_tags(cls, tags: list[str]) -> list[str]:
        if any(not tag.strip() or len(tag) > 60 for tag in tags):
            raise ValueError('标签必须为 1–60 个字符')
        return list(dict.fromkeys(tag.strip() for tag in tags))


class AdviceItem(BaseModel):
    skill: str
    suggestion: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[str] = Field(default_factory=list)
    supported: bool = False


class AdvicePayload(BaseModel):
    advice: list[AdviceItem] = Field(max_length=20)
