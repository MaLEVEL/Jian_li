import re

from ..schemas import JobParsed, ResumeParsed
from ..tools.skills import canonical_skill, extract_skills, skill_evidence


def experience_years(text: str) -> float | None:
    match = re.search(r'(\d+(?:\.\d+)?)\s*(?:年|years?)(?:以上)?\s*(?:相关)?(?:工作|开发|经验|experience)', text, re.I)
    return min(float(match.group(1)), 60) if match else None


def local_job(text: str) -> dict:
    requirements = []
    for name in extract_skills(text):
        clauses = [line for line in re.split(r'[\n。；;，,]', text) if skill_evidence(line, name)]
        if not clauses:
            continue
        optional = all(re.search(r'加分|优先|可选|nice.to.have|preferred|bonus|optional', line, re.I) for line in clauses)
        requirements.append({'name': name, 'required': not optional, 'weight': 1.0 if optional else 3.0})
    return {'skills': requirements, 'experience_years': experience_years(text), 'domain': ''}


def local_resume(text: str) -> dict:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    projects = [line[:500] for line in lines if re.search(r'项目|开发|实现|构建|project|built|develop', line, re.I)]
    return {'skills': [s for s in extract_skills(text) if skill_evidence(text, s)],
            'experience_years': experience_years(text), 'projects': projects[:30]}


def grounded_job(parsed: JobParsed, text: str) -> dict:
    result = parsed.model_dump()
    result['skills'] = [
        {'name': canonical_skill(s.name), 'required': s.required, 'weight': 3.0 if s.required else 1.0}
        for s in parsed.skills if skill_evidence(text, s.name)
    ]
    return result


def grounded_resume(parsed: ResumeParsed, text: str) -> dict:
    result = parsed.model_dump()
    result['skills'] = list(dict.fromkeys(canonical_skill(s) for s in parsed.skills if skill_evidence(text, s)))
    result['projects'] = [s for s in parsed.projects if s.strip() and s.strip() in text]
    return result
