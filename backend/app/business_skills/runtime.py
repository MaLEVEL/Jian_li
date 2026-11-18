"""Server-side runtime for the product's controlled business skills."""

from __future__ import annotations

import asyncio
import json
import re
from time import perf_counter
from uuid import uuid4

from ..config import Settings
from ..llm import ModelClient, ModelUnavailable
from ..schemas import (
    ModelSkillItem,
    SkillPayload,
    SkillRunItem,
    SkillRunSection,
    SkillRunSource,
)
from ..store import Store, now_iso
from ..tools.skills import extract_skills
from .knowledge import interview_card
from .registry import SkillPackage

_RESERVED_SOURCE_IDS = {'resume', 'jd'}
_BUSINESS_SKILL_MAX_TOKENS = 1200
_MAX_ITEM_CONTENT = 4000
_NUMBER = re.compile(r'\d+(?:\.\d+)?')
_CHINESE_NUMBER = re.compile(r'[零一二两三四五六七八九十百千万亿]+(?:个|台|年|次|人|页|条|万|亿|倍)')
_ENGLISH_TOKEN = re.compile(r'[A-Za-z][A-Za-z0-9_-]*')
_PERSONAL_PAST = re.compile(r'(?:你|您|本人|候选人|我).{0,20}(?:曾|过去|负责|做过|任职|拥有)|(?:曾|过去).{0,20}(?:负责|做过|任职|拥有)')
_ALLOWED_ENGLISH = {'jd', 'star', 'api', 'id'}


def _normalize_chinese_number(value: str) -> float:
    digits = {'零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
              '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}
    units = {'十': 10, '百': 100, '千': 1000}
    total = section = number = 0
    for char in value[:-1]:
        if char in digits:
            number = digits[char]
            continue
        if char in units:
            section += (number or 1) * units[char]
            number = 0
        elif char == '万':
            total = (total + section + number) * 10000
            section = number = 0
        elif char == '亿':
            total = (total + section + number) * 100000000
            section = number = 0
    return float(total + section + number)


def _number_values(text: str) -> set[float]:
    values = {float(value) for value in _NUMBER.findall(text)}
    for match in _CHINESE_NUMBER.findall(text):
        values.add(_normalize_chinese_number(match))
    return values


def _english_tokens(text: str) -> set[str]:
    return {token.casefold() for token in _ENGLISH_TOKEN.findall(text)}


def _source(identifier: str, title: str, content: str) -> SkillRunSource:
    return SkillRunSource(id=identifier, title=title, content=content.strip() or '（无可用内容）')


def build_sources(analysis: dict) -> tuple[list[SkillRunSource], list[str]]:
    warnings: list[str] = []
    inputs = analysis.get('inputs') if isinstance(analysis.get('inputs'), dict) else {}
    resume_text, jd_text = inputs.get('resume_text'), inputs.get('jd_text')
    if isinstance(resume_text, str) and resume_text.strip() and isinstance(jd_text, str) and jd_text.strip():
        sources = [_source('resume', '简历原文', resume_text), _source('jd', 'JD 原文', jd_text)]
    else:
        resume_parts = list(analysis.get('resume', {}).get('projects', []))
        resume_parts.extend(
            row.get('evidence', '') for row in analysis.get('breakdown', []) if row.get('evidence')
        )
        jd_parts = [
            f"技能要求：{row.get('name', '')}（{'必需' if row.get('required') else '加分'}，权重 {row.get('weight', 0):g}）"
            for row in analysis.get('jd', {}).get('skills', [])
        ]
        if analysis.get('jd', {}).get('experience_years') is not None:
            jd_parts.append(f"经验要求：{analysis['jd']['experience_years']:g} 年")
        if analysis.get('jd', {}).get('domain'):
            jd_parts.append('业务领域：' + analysis['jd']['domain'])
        sources = [
            _source('resume', '简历结构化回退（非完整原文）', '\n'.join(dict.fromkeys(p for p in resume_parts if p))),
            _source('jd', 'JD 结构化回退（非完整原文）', '\n'.join(dict.fromkeys(jd_parts))),
        ]
        warnings.append('原始输入不可用：已使用已保存分析中的 projects、匹配 evidence 和 JD skills 做结构化结果回退。')

    material_sources = [
        _source(str(row['id']), str(row.get('title', '真实素材')), str(row.get('content', '')))
        for row in analysis.get('evidence', [])
        if row.get('id') and row.get('id') not in _RESERVED_SOURCE_IDS
    ]
    material_limit = 30 - len(sources)
    if len(material_sources) > material_limit:
        omitted = len(material_sources) - material_limit
        sources.extend(material_sources[:material_limit])
        warnings.append(f'素材来源过多：已按检索顺序保留前 {material_limit} 条，另有 {omitted} 条未展示。')
    else:
        sources.extend(material_sources)
    return sources, warnings


def _item(heading: str, content: str, kind: str, source_ids: list[str], review_required: bool = False) -> SkillRunItem:
    text = content.strip()
    if len(text) > _MAX_ITEM_CONTENT:
        text = (
            f'原文超过单条结果 {_MAX_ITEM_CONTENT} 字符展示上限，为避免截断失真，'
            '本条未自动展示；请在来源中打开完整内容核对。'
        )
    return SkillRunItem(
        heading=heading[:200],
        content=text,
        kind=kind,
        source_ids=list(dict.fromkeys(source_ids)),
        review_required=review_required,
    )


def _bounded_section(title: str, items: list[SkillRunItem], source_id: str = 'jd') -> SkillRunSection:
    if len(items) <= 20:
        return SkillRunSection(title=title, items=items)
    omitted = len(items) - 19
    retained = items[:19] + [_item(
        '部分结果未展示',
        f'输入条目较多：已按保存顺序保留前 19 项，另有 {omitted} 项未展示。',
        'fact', [source_id],
    )]
    return SkillRunSection(title=title, items=retained)


def offline_sections(skill_id: str, analysis: dict, sources: list[SkillRunSource]) -> list[SkillRunSection]:
    matched = analysis.get('matched_skills', [])
    missing = analysis.get('missing_skills', [])
    breakdown = analysis.get('breakdown', [])
    materials = [source for source in sources if source.id not in _RESERVED_SOURCE_IDS]

    if skill_id == 'jd-diagnosis':
        requirements = [
            _item(
                f"岗位要求：{row.get('name', '')}",
                f"{row.get('name', '')} 为{'必需' if row.get('required') else '加分'}项，权重 {row.get('weight', 0):g}。",
                'fact', ['jd'],
            )
            for row in analysis.get('jd', {}).get('skills', [])
        ]
        hits = [
            _item(f"匹配证据：{row.get('skill', '')}", f"简历原文可核实摘录：{row.get('evidence', '')}", 'fact', ['resume'])
            for row in breakdown if row.get('matched') and row.get('evidence')
        ]
        gaps = [
            _item(
                f"缺少直接证据：{skill}",
                f"已保存分析未在简历中找到 {skill} 的直接证据。这是证据缺口，不代表候选人不具备该能力。",
                'fact', ['jd'],
            )
            for skill in missing
        ]
        return [
            _bounded_section('岗位要求拆解', requirements or [_item('岗位要求', '未识别到具体技能要求。', 'fact', ['jd'])]),
            _bounded_section('匹配证据', hits or [_item('匹配证据', '本轮没有可核实的简历命中摘录。', 'fact', ['resume'])], 'resume'),
            _bounded_section('缺口诊断', gaps or [_item('缺口诊断', '已识别要求均找到直接证据。', 'fact', ['jd'])]),
        ]

    if skill_id == 'resume-tailor':
        projects = analysis.get('resume', {}).get('projects', [])
        anchors = [_item(f'真实项目：{project[:60]}', f'原文摘录：{project}', 'fact', ['resume']) for project in projects]
        anchors.extend(
            _item(f'真实素材：{source.title}', f'素材原文摘录：{source.content}', 'fact', [source.id]) for source in materials
        )
        proposals = [
            _item(
                '可核实内容优先',
                f"优先保留并清晰呈现以上真实项目；围绕 JD 中已命中的 {'、'.join(matched) if matched else '相关要求'} 调整项目标题和位置。只能重述原文事实，不得添加经历、技术或数字。",
                'proposal', ['resume'], True,
            )
        ]
        for offset in range(0, len(materials), 10):
            group = materials[offset:offset + 10]
            proposals.append(
                _item(
                    '素材并入前核对',
                    '以下素材可作为经历补充线索，但必须先由本人确认真实性、时间线和职责后再写入：'
                    + '；'.join(source.content for source in group),
                    'proposal', [source.id for source in group], True,
                )
            )
        return [
            _bounded_section('真实经历锚点', anchors or [_item('真实经历锚点', '旧报告未保存完整简历原文，也没有项目摘录。', 'fact', ['resume'])], 'resume'),
            _bounded_section('定制改写建议', proposals, 'resume'),
            SkillRunSection(title='边界提醒', items=[
                _item('禁止无证改写', '不要把 JD 要求写成个人经历；不要新增来源中没有的技术、年限或量化指标。', 'fact', ['jd'], True)
            ]),
        ]

    missing_limit = min(len(missing), 5 if matched else 6)
    selected_skills = list(dict.fromkeys([*missing[:missing_limit], *matched]))[:6]
    study, questions = [], []
    for skill in selected_skills:
        card = None
        if interview_card is not None:
            try:
                card = interview_card(skill)
            except (KeyError, TypeError, ValueError):
                card = None
        if isinstance(card, dict):
            concepts = str(card.get('concepts', ''))
            practice = str(card.get('practice', ''))
            question = str(card.get('question', f'请解释 {skill} 的核心取舍。'))
            answer = str(card.get('answer', ''))
            follow_up = str(card.get('follow_up', ''))
            study.append(_item(
                f'速学路径：{skill}',
                f'学习练习（非个人经历断言）：知识点：{concepts}；实践：{practice}',
                'study', ['jd'],
            ))
            questions.append(_item(
                f'练习问题：{skill}',
                f'生成练习（非真实面试题或个人经历断言）：{question} 回答要点：{answer}；追问：{follow_up}',
                'question', ['jd'] if skill in missing else ['resume', 'jd'],
            ))
        else:
            study.append(_item(
                f'速学路径：{skill}',
                f'学习练习（非个人经历断言）：先学习 {skill} 的核心概念和常见故障；再完成一个最小实践并记录设计、实现、验证过程；最后整理成可讲清的复盘。',
                'study', ['jd'],
            ))
            questions.append(_item(
                f'练习问题：{skill}',
                f'生成练习（非真实面试题或个人经历断言）：请解释 {skill} 的取舍、实现和验证；如无可引用的真实经历，请明确说明这是学习实践。回答要点：背景、做法、验证、改进；追问：异常场景、替代方案和代价。',
                'question', ['jd'] if skill in missing else ['resume', 'jd'],
            ))
    return [
        _bounded_section('速学知识点与复习顺序', study or [_item('速学知识点', '没有可提取的技能要求。', 'study', ['jd'])]),
        _bounded_section('预测练习与回答提纲', questions or [_item('练习问题', '请补充具体 JD 后生成练习。', 'question', ['jd'])]),
    ]


def _validated_model_items(
    payload: SkillPayload,
    skill_id: str,
    sources: list[SkillRunSource],
) -> tuple[list[SkillRunSection], int]:
    by_id = {source.id: source for source in sources}
    sections: list[SkillRunSection] = []
    dropped = 0

    for model_section in payload.sections:
        valid: list[SkillRunItem] = []
        for candidate in model_section.items:
            item = _validated_item(candidate, skill_id, by_id)
            if item is None:
                dropped += 1
                continue
            valid.append(item)
        if valid:
            sections.append(SkillRunSection(title=model_section.title, items=valid))
    return sections, dropped


def _validated_item(
    item: ModelSkillItem,
    skill_id: str,
    sources: dict[str, SkillRunSource],
) -> SkillRunItem | None:
    if not item.source_ids:
        return None
    cited = [sources[source_id] for source_id in item.source_ids if source_id in sources]
    if len(cited) != len(set(item.source_ids)) or len(cited) != len(item.source_ids):
        return None

    if item.kind == 'proposal':
        if skill_id != 'resume-tailor' or 'jd' in item.source_ids:
            return None
        if not item.source_quote or not any(item.source_quote in source.content for source in cited):
            return None
        source_text = '\n'.join(source.content for source in cited)
        if _number_values(item.content) - _number_values(source_text):
            return None
        source_skills = {skill.casefold() for skill in extract_skills(source_text)}
        if any(skill.casefold() not in source_skills for skill in extract_skills(item.content)):
            return None
        unknown_english = _english_tokens(item.content) - _english_tokens(source_text) - _ALLOWED_ENGLISH
        if unknown_english:
            return None
        return SkillRunItem(
            heading=item.heading,
            content=item.content,
            kind='proposal',
            source_ids=list(dict.fromkeys(item.source_ids)),
            review_required=True,
        )

    if item.kind == 'fact':
        if not item.source_quote:
            return None
        matching_sources = [source for source in cited if item.source_quote in source.content]
        if not matching_sources:
            return None
        return SkillRunItem(
            heading='已核实原文摘录',
            content=item.source_quote,
            kind='fact',
            source_ids=[source.id for source in matching_sources],
            review_required=False,
        )

    if item.kind in {'study', 'question'} and _PERSONAL_PAST.search(item.content):
        return None
    content = item.content
    if item.kind == 'question':
        prefix = '生成练习（非真实面试题或个人经历断言）：'
        if not content.startswith(prefix):
            if len(prefix) + len(content) > _MAX_ITEM_CONTENT:
                return None
            content = prefix + content
    elif item.kind == 'study' and not content.startswith('学习练习（非个人经历断言）：'):
        prefix = '学习练习（非个人经历断言）：'
        if len(prefix) + len(content) > _MAX_ITEM_CONTENT:
            return None
        content = prefix + content
    return SkillRunItem(
        heading=item.heading,
        content=content,
        kind=item.kind,
        source_ids=list(dict.fromkeys(item.source_ids)),
        review_required=False,
    )


async def run_skill(
    package: SkillPackage,
    analysis: dict,
    settings: Settings,
    store: Store,
) -> dict:
    started = perf_counter()
    client = ModelClient(settings)
    sources, warnings = build_sources(analysis)
    sections = offline_sections(package.definition.id, analysis, sources)
    mode = 'offline'
    model = 'offline-rules'

    if settings.online:
        model = settings.model
        user_text = json.dumps({
            'skill': package.definition.model_dump(),
            'analysis': {
                key: analysis.get(key)
                for key in ('title', 'company', 'score', 'matched_skills', 'missing_skills', 'breakdown', 'resume', 'jd')
            },
            'sources': [source.model_dump() for source in sources],
        }, ensure_ascii=False)
        try:
            payload = await client.complete(
                'business_skill', user_text, SkillPayload, system_instructions=package.document,
                max_tokens=_BUSINESS_SKILL_MAX_TOKENS
            )
            model_sections, dropped = _validated_model_items(payload, package.definition.id, sources)
            if dropped:
                warnings.append(f'{dropped} 条模型输出未通过证据核验或输出边界，已丢弃；请以保留的原文摘录为准。')
            if model_sections:
                sections = [*sections, *model_sections]
                mode = 'online' if not dropped else 'degraded'
            else:
                warnings.append('模型输出全部未通过证据核验或输出边界，已丢弃并使用离线规则结果。')
                mode = 'degraded'
            warnings.append(
                '技能运行额外消耗 1 次 complete 逻辑调用；底层请求失败时会按服务端配置重试 HTTP。'
            )
        except ModelUnavailable as error:
            mode = 'degraded'
            warnings.append(f'技能生成已降级：{error}；已使用离线规则结果。')
    else:
        warnings.append('当前为离线规则模式，业务技能未调用模型；结果可复制为 Markdown 后人工核实。')

    result = {
        'id': uuid4().hex,
        'skill_id': package.definition.id,
        'skill_name': package.definition.name,
        'skill_version': package.definition.version,
        'analysis_id': analysis['id'],
        'title': analysis.get('title') or analysis.get('company') or package.definition.name,
        'mode': mode,
        'model': model,
        'warnings': warnings,
        'duration_ms': round((perf_counter() - started) * 1000, 2),
        'usage': client.usage,
        'created_at': now_iso(),
        'sections': [section.model_dump() for section in sections],
        'sources': [source.model_dump() for source in sources],
    }
    await _save(store, result)
    return result


async def _save(store: Store, result: dict) -> None:
    await asyncio.to_thread(store.save_skill_run, result)


__all__ = ['build_sources', 'offline_sections', 'run_skill']
