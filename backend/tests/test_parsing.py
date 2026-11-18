from app.nodes.parsers import local_job, local_resume
from app.tools.scoring import score_match


def test_optional_clause_does_not_weaken_required_skill_on_same_line():
    parsed = local_job('必须熟悉 Python，Docker 优先；熟悉 FastAPI。')
    skills = {s['name']: s for s in parsed['skills']}
    assert skills['Python']['required'] is True
    assert skills['Docker']['required'] is False
    assert skills['FastAPI']['required'] is True


def test_negated_resume_skill_is_not_claimed_as_a_match():
    text = '使用 Python 开发 API。尚未掌握 Docker。'
    parsed = local_resume(text)
    result = score_match([{'name': 'Docker', 'required': True}], parsed['skills'], text)
    assert result['score'] == 0


def test_no_requirement_clause_is_not_a_required_skill():
    parsed = local_job('必须 Python；不要求 Java。')
    assert [s['name'] for s in parsed['skills']] == ['Python']
