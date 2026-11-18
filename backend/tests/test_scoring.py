from app.tools.scoring import score_match
from app.tools.skills import extract_skills


def test_real_aliases_match_but_distinct_frameworks_do_not():
    assert 'scikit-learn' in extract_skills('使用 sklearn 训练分类器')
    assert 'LangGraph' not in extract_skills('熟悉 LangChain')
    assert 'Java' not in extract_skills('JavaScript developer')


def test_weighted_score_explains_every_requirement():
    result = score_match(
        [{'name': 'Python', 'required': True, 'weight': 3},
         {'name': 'Docker', 'required': False, 'weight': 1}],
        ['Python'], '使用 Python 开发 API',
    )
    assert result['score'] == 75
    assert result['missing_skills'] == ['Docker']
    assert result['breakdown'][0]['evidence'] == '使用 Python 开发 API'
    assert result['breakdown'][1]['matched'] is False


def test_empty_requirements_have_zero_score_and_clear_explanation():
    result = score_match([], ['Python'], 'Python')
    assert result['score'] == 0
    assert '未识别' in result['explanation']
