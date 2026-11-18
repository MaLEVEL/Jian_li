"""Fixed allowlist registry for server-side business skill packages."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from ..schemas import SkillDefinition

_PACKAGE_ROOT = Path(__file__).parent
_SKILL_FILES = {
    'jd-diagnosis': _PACKAGE_ROOT / 'jd-diagnosis' / 'SKILL.md',
    'resume-tailor': _PACKAGE_ROOT / 'resume-tailor' / 'SKILL.md',
    'interview-prep': _PACKAGE_ROOT / 'interview-prep' / 'SKILL.md',
}


@dataclass(frozen=True)
class SkillPackage:
    definition: SkillDefinition
    purpose: str
    instructions: str
    document: str


def _parse_markdown(skill_id: str, path: Path) -> SkillPackage:
    document = path.read_text(encoding='utf-8')
    match = re.fullmatch(r'---\n(.*?)\n---\n(.*)', document, flags=re.DOTALL)
    if not match:
        raise RuntimeError(f'业务技能包 {skill_id} 缺少有效元数据')
    metadata = {}
    for line in match.group(1).splitlines():
        key, separator, value = line.partition(':')
        if separator and key.strip() in {'id', 'name', 'description', 'version'}:
            metadata[key.strip()] = value.strip().strip('"\'')
    definition = SkillDefinition.model_validate(metadata)
    if definition.id != skill_id or path.resolve() != _SKILL_FILES[skill_id].resolve():
        raise RuntimeError(f'业务技能包 {skill_id} 标识或路径不匹配')
    body = match.group(2)
    purpose_match = re.search(r'## Purpose\s*\n(.*?)(?=\n## Instructions\b)', body, flags=re.DOTALL)
    instructions_match = re.search(r'## Instructions\s*\n(.*)$', body, flags=re.DOTALL)
    if not purpose_match or not instructions_match:
        raise RuntimeError(f'业务技能包 {skill_id} 缺少 Purpose 或 Instructions')
    return SkillPackage(
        definition=definition,
        purpose=purpose_match.group(1).strip(),
        instructions=instructions_match.group(1).strip(),
        document=document,
    )


def list_skills() -> list[SkillDefinition]:
    return [_parse_markdown(skill_id, _SKILL_FILES[skill_id]).definition for skill_id in _SKILL_FILES]


def get_skill(skill_id: str) -> SkillPackage:
    path = _SKILL_FILES.get(skill_id)
    if path is None:
        raise KeyError(skill_id)
    return _parse_markdown(skill_id, path)


__all__ = ['SkillPackage', 'get_skill', 'list_skills']
