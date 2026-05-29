import asyncio
import json
import os
import re
from dataclasses import dataclass
from dataclasses import field
from typing import Any

import httpx

from app.models import Job, Resume


@dataclass
class AIClient:
    api_key: str | None = field(default_factory=lambda: os.getenv("OPENAI_API_KEY"))
    base_url: str = field(
        default_factory=lambda: os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    )
    model: str = field(default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    max_retries: int = field(default_factory=lambda: _env_int("OPENAI_MAX_RETRIES", 2))
    timeout_seconds: float = field(default_factory=lambda: _env_float("OPENAI_TIMEOUT_SECONDS", 30.0))

    async def analyze_fit(self, resume: Resume, job: Job) -> dict[str, Any]:
        if not self.api_key:
            return fallback_analysis(resume.text, job.description)

        prompt = (
            "You are JobFit AI. Return only valid JSON with keys: "
            "match_score, strengths, gaps, suggestions, optimized_bullets. "
            "All list fields must be arrays of strings. "
            f"Resume:\n{resume.text[:6000]}\n\nJob description:\n{job.description[:6000]}"
        )
        try:
            payload = await self._chat_completion(prompt)
            return normalize_analysis(payload)
        except Exception:
            return fallback_analysis(resume.text, job.description)

    async def interview_questions(self, resume: Resume, job: Job) -> dict[str, list[str]]:
        if not self.api_key:
            return fallback_questions(resume.text, job.description)

        prompt = (
            "Create interview questions for this candidate and role. "
            "Return only valid JSON with keys technical, project, behavioral. "
            "Each value must be an array of strings. "
            f"Resume:\n{resume.text[:6000]}\n\nJob description:\n{job.description[:6000]}"
        )
        try:
            payload = await self._chat_completion(prompt)
            return normalize_questions(payload)
        except Exception:
            return fallback_questions(resume.text, job.description)

    async def _chat_completion(self, prompt: str) -> dict[str, Any]:
        url = self.base_url.rstrip("/") + "/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        last_error: Exception | None = None
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            for attempt in range(self.max_retries + 1):
                try:
                    response = await client.post(url, headers=headers, json=body)
                    response.raise_for_status()
                    content = response.json()["choices"][0]["message"]["content"]
                    return json.loads(content)
                except Exception as exc:
                    last_error = exc
                    if attempt >= self.max_retries or not _is_retryable_error(exc):
                        raise
                    await asyncio.sleep(0.5 * (2**attempt))
        raise RuntimeError("AI request failed") from last_error


def fallback_analysis(resume_text: str, job_description: str) -> dict[str, Any]:
    resume_keywords = _keywords(resume_text)
    job_keywords = _keywords(job_description)
    overlap = sorted(resume_keywords & job_keywords)
    missing = sorted(job_keywords - resume_keywords)
    score = 45
    if job_keywords:
        score = min(95, 40 + round(len(overlap) / len(job_keywords) * 55))

    strengths = [
        f"简历与岗位关键词有交集：{', '.join(overlap[:6]) or '需要进一步补充关键词'}",
        "候选人经历已可用于生成岗位匹配分析。",
        "当前分析使用本地 fallback，结果稳定可预测，适合无 API key 测试。",
    ]
    gaps = [
        f"岗位要求中尚未明显体现：{', '.join(missing[:6]) or '暂无明显缺口'}",
        "建议补充可量化成果，例如规模、性能、转化率或交付周期。",
    ]
    suggestions = [
        "把简历项目经历按岗位 JD 的核心关键词重新排序。",
        "每条经历加入动作、技术、结果三部分，提升可读性。",
        "针对岗位描述补充一段 3 到 4 句的求职亮点总结。",
    ]
    optimized_bullets = [
        "围绕目标岗位关键词重写项目亮点，突出技术选型、职责边界和业务结果。",
        "补充可验证指标，例如接口响应时间、数据规模、自动化覆盖率或用户增长。",
        "将与 JD 最相关的技能放到简历前半部分，降低筛选成本。",
    ]
    return {
        "match_score": score,
        "strengths": strengths,
        "gaps": gaps,
        "suggestions": suggestions,
        "optimized_bullets": optimized_bullets,
    }


def fallback_questions(resume_text: str, job_description: str) -> dict[str, list[str]]:
    overlap = sorted(_keywords(resume_text) & _keywords(job_description))
    focus = overlap[0] if overlap else "你最相关的项目"
    return {
        "technical": [
            f"请讲讲你在 {focus} 相关工作中遇到的技术难点和解决方案。",
            "如果要提升一个接口的稳定性和性能，你会先看哪些指标？",
            "你如何设计数据模型来支持后续功能扩展？",
        ],
        "project": [
            "请选择一个最能代表你能力的项目，说明背景、职责、方案和结果。",
            "项目中出现需求变化时，你是如何评估影响并推进落地的？",
            "你做过哪些复盘，后来具体改进了什么？",
        ],
        "behavioral": [
            "请描述一次你主动发现问题并推动解决的经历。",
            "当任务优先级冲突时，你如何和团队沟通取舍？",
            "你希望下一份工作在哪些方面获得成长？",
        ],
    }


def normalize_analysis(payload: dict[str, Any]) -> dict[str, Any]:
    fallback = fallback_analysis("", "")
    return {
        "match_score": _score(payload.get("match_score", fallback["match_score"])),
        "strengths": _string_list(payload.get("strengths"), fallback["strengths"]),
        "gaps": _string_list(payload.get("gaps"), fallback["gaps"]),
        "suggestions": _string_list(payload.get("suggestions"), fallback["suggestions"]),
        "optimized_bullets": _string_list(
            payload.get("optimized_bullets"), fallback["optimized_bullets"]
        ),
    }


def normalize_questions(payload: dict[str, Any]) -> dict[str, list[str]]:
    fallback = fallback_questions("", "")
    return {
        "technical": _string_list(payload.get("technical"), fallback["technical"]),
        "project": _string_list(payload.get("project"), fallback["project"]),
        "behavioral": _string_list(payload.get("behavioral"), fallback["behavioral"]),
    }


def _score(value: Any) -> int:
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return 50


def _string_list(value: Any, default: list[str]) -> list[str]:
    if not isinstance(value, list):
        return default
    cleaned = [str(item).strip() for item in value if str(item).strip()]
    return cleaned or default


def _keywords(text: str) -> set[str]:
    words = re.findall(r"[A-Za-z][A-Za-z0-9+#.-]{1,}|[\u4e00-\u9fff]{2,}", text.lower())
    stopwords = {
        "and",
        "or",
        "the",
        "with",
        "for",
        "to",
        "of",
        "in",
        "a",
        "an",
        "is",
        "are",
        "岗位",
        "负责",
        "熟悉",
        "经验",
        "能力",
    }
    return {word for word in words if word not in stopwords}


def _is_retryable_error(exc: Exception) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code
        return status_code in {408, 409, 429} or status_code >= 500
    return isinstance(
        exc,
        (
            httpx.TimeoutException,
            httpx.NetworkError,
            httpx.RemoteProtocolError,
            json.JSONDecodeError,
            KeyError,
            IndexError,
            TypeError,
        ),
    )


def _env_int(name: str, default: int) -> int:
    try:
        return max(0, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return max(1.0, float(os.getenv(name, str(default))))
    except ValueError:
        return default
