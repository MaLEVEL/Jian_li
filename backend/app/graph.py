import asyncio
import json
from time import perf_counter
from typing import TypedDict
from uuid import uuid4

from langgraph.graph import END, START, StateGraph

from .config import Settings
from .llm import ModelClient, ModelUnavailable
from .nodes.parsers import grounded_job, grounded_resume, local_job, local_resume
from .schemas import AdvicePayload, AnalyzeRequest, JobParsed, ResumeParsed
from .store import Store, now_iso
from .tools.scoring import score_match
from .tools.skills import canonical_skill, skill_evidence


class AgentState(TypedDict, total=False):
    intent: str
    jd: dict
    resume: dict
    match: dict
    evidence: list[dict]
    advice: list[dict]
    trace: list[dict]


def grounded_advice(missing: list[str], evidence: list[dict]) -> list[dict]:
    result = []
    for skill in missing:
        supporting = [e for e in evidence if skill_evidence(e["content"], skill)]
        if supporting:
            item = supporting[0]
            suggestion = (
                f"素材「{item['title']}」包含相关证据：{skill_evidence(item['content'], skill)}。"
                "如为本人真实经历，可补充职责、技术选择与可验证成果，核对后再写入简历。"
            )
        else:
            suggestion = f"素材中未找到 {skill} 的直接证据。建议完成相关练习并记录真实实现，再决定是否写入简历；不要直接添加已掌握声明。"
        result.append(
            {
                "skill": skill,
                "suggestion": suggestion,
                "evidence_ids": [supporting[0]["id"]] if supporting else [],
                "supported": bool(supporting),
            }
        )
    return result


async def run_analysis(request: AnalyzeRequest, settings: Settings, store: Store, retriever) -> dict:
    started = perf_counter()
    client = ModelClient(settings)
    warnings: list[str] = []
    if not settings.online:
        warnings.append("当前为离线规则模式，未调用真实大模型。配置服务端 API Key 后可启用智谱结构化解析与建议。")
    online_successes = 0
    actual_rag_mode = retriever.mode

    async def route(state):
        return {"intent": "single"}

    def add_grounding_warnings(label: str, model: dict, grounded: dict) -> None:
        fields = ["experience_years", "domain"] if label == "JD" else ["experience_years"]
        removed = [field for field in fields if model.get(field) != grounded.get(field)]
        if removed:
            warnings.append(f"{label} 解析中的 {'、'.join(removed)} 未在原文核验，已移除并使用保守结果。")

    async def parse_jd(state):
        nonlocal online_successes
        if settings.online:
            try:
                value = await client.complete("jd", request.jd_text, JobParsed)
                online_successes += 1
                grounded = grounded_job(value, request.jd_text)
                add_grounding_warnings("JD", value.model_dump(), grounded)
                return {"jd": grounded}
            except ModelUnavailable as error:
                warnings.append(f"JD 解析已降级：{error}")
        return {"jd": local_job(request.jd_text)}

    async def parse_resume(state):
        nonlocal online_successes
        if settings.online:
            try:
                value = await client.complete("resume", request.resume_text, ResumeParsed)
                online_successes += 1
                grounded = grounded_resume(value, request.resume_text)
                add_grounding_warnings("简历", value.model_dump(), grounded)
                return {"resume": grounded}
            except ModelUnavailable as error:
                warnings.append(f"简历解析已降级：{error}")
        return {"resume": local_resume(request.resume_text)}

    async def match(state):
        return {"match": score_match(state["jd"]["skills"], state["resume"]["skills"], request.resume_text)}

    async def retrieve(state):
        nonlocal actual_rag_mode
        missing = state["match"]["missing_skills"]
        if not missing:
            return {"evidence": []}
        query = " ".join(missing) + " " + request.title
        try:
            hits = await asyncio.to_thread(retriever.search, query, store.materials(), 5)
            return {"evidence": hits}
        except Exception:
            actual_rag_mode = "unavailable"
            warnings.append("素材检索不可用，请检查所选 RAG 模式的依赖和模型文件；本次建议不引用素材。")
            return {"evidence": []}

    async def advise(state):
        nonlocal online_successes
        missing, evidence = state["match"]["missing_skills"], state["evidence"]
        safe = grounded_advice(missing, evidence)
        if not settings.online or not missing:
            return {"advice": safe}
        try:
            result = await client.complete(
                "advice",
                json.dumps(
                    {"missing_skills": missing, "resume": request.resume_text, "evidence": evidence}, ensure_ascii=False
                ),
                AdvicePayload,
            )
            online_successes += 1
            by_skill = {canonical_skill(a.skill): a for a in result.advice}
            rejected_rewrites = 0
            for item in safe:
                candidate = by_skill.get(item["skill"])
                if not candidate or not item["supported"]:
                    continue
                allowed = [e for e in evidence if skill_evidence(e["content"], item["skill"])]
                allowed_ids = {e["id"] for e in allowed}
                valid_ids = bool(candidate.evidence_ids) and set(candidate.evidence_ids) <= allowed_ids
                cited = [e["content"] for e in allowed if e["id"] in set(candidate.evidence_ids)]
                quote = candidate.source_quote.strip()
                suggestion = candidate.suggestion.strip()
                verbatim = bool(quote) and any(quote in content and suggestion in content for content in cited)
                if candidate.supported and valid_ids and verbatim:
                    # Only the exact source quote enters the supported model-output channel.
                    item["suggestion"] += "\n模型已核对摘录：" + quote
                else:
                    rejected_rewrites += 1
            if rejected_rewrites:
                warnings.append(f"{rejected_rewrites} 条模型改写未通过原文核验，已丢弃并保留保守建议。")
            return {"advice": safe}
        except ModelUnavailable as error:
            warnings.append(f"建议生成已降级：{error}")
            return {"advice": safe}

    graph = StateGraph(AgentState)

    def traced(name, function):
        async def invoke(state):
            begin, before = perf_counter(), len(warnings)
            update = await function(state)
            update["trace"] = [
                *state.get("trace", []),
                {
                    "node": name,
                    "status": "degraded" if len(warnings) > before else "completed",
                    "duration_ms": round((perf_counter() - begin) * 1000, 2),
                },
            ]
            return update

        return invoke

    nodes = [
        ("route", route),
        ("parse_jd", parse_jd),
        ("parse_resume", parse_resume),
        ("match", match),
        ("retrieve", retrieve),
        ("advise", advise),
    ]
    previous = START
    for name, function in nodes:
        graph.add_node(name, traced(name, function))
        graph.add_edge(previous, name)
        previous = name
    graph.add_edge(previous, END)
    state = await graph.compile().ainvoke({"trace": []})
    mode = "online" if settings.online and not warnings else ("degraded" if settings.online else "offline")
    if settings.online and not online_successes:
        warnings.append("所有模型步骤均未成功，本次评分与建议来自规则模式。")
    if settings.online and online_successes:
        warnings.append("在线模式由模型抽取结构，改写提案仍可能有误，请按原文和素材逐条人工核实。")
    report = {
        "id": uuid4().hex,
        "company": request.company,
        "title": request.title,
        **state["match"],
        "jd": state["jd"],
        "resume": state["resume"],
        "advice": state["advice"],
        "evidence": state["evidence"],
        "trace": state["trace"],
        "mode": mode,
        "model": settings.model if settings.online else "offline-rules",
        "warnings": warnings,
        "duration_ms": round((perf_counter() - started) * 1000, 2),
        "usage": client.usage,
        "created_at": now_iso(),
        "rag_mode": actual_rag_mode,
        "inputs": request.model_dump(),
    }
    await asyncio.to_thread(store.save_analysis, report)
    return report
