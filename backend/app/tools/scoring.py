from .skills import canonical_skill, skill_evidence


def score_match(requirements: list[dict], resume_skills: list[str], resume_text: str) -> dict:
    aligned = {canonical_skill(s).casefold() for s in resume_skills}
    breakdown, seen = [], set()
    for item in requirements:
        name = canonical_skill(item['name'])
        if name.casefold() in seen:
            continue
        seen.add(name.casefold())
        evidence = skill_evidence(resume_text, name)
        matched = name.casefold() in aligned and bool(evidence)
        breakdown.append({'skill': name, 'weight': 3.0 if item.get('required', True) else 1.0,
                          'matched': matched, 'evidence': evidence if matched else ''})
    total = sum(row['weight'] for row in breakdown)
    earned = sum(row['weight'] for row in breakdown if row['matched'])
    return {
        'score': round(earned / total * 100, 1) if total else 0.0,
        'matched_skills': [r['skill'] for r in breakdown if r['matched']],
        'missing_skills': [r['skill'] for r in breakdown if not r['matched']],
        'breakdown': breakdown,
        'explanation': f'技能加权覆盖率：命中权重 {earned:g} / 总权重 {total:g}；必需技能权重 3，加分技能权重 1。分数不代表录用概率。'
        if total else '未识别到可核实的技能要求，请补充具体 JD；当前分数为 0，不代表候选人能力。',
    }
