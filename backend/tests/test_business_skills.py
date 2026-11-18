import json
from pathlib import Path

import httpx
import pytest
from app.config import Settings
from app.llm import ModelClient, ModelUnavailable
from app.main import create_app
from app.schemas import JobParsed
from fastapi.testclient import TestClient

SKILL_IDS = {'jd-diagnosis', 'resume-tailor', 'interview-prep'}


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path, llm_mode='offline'))) as value:
        yield value


def create_analysis(client, with_material=True):
    material = None
    if with_material:
        material = client.post('/api/materials', json={
            'title': '真实容器经历',
            'content': '使用 Docker 打包课程项目，并编写镜像构建文档。',
            'tags': ['Docker'],
        }).json()
    response = client.post('/api/analyze', json={
        'resume_text': '项目：使用 Python 和 FastAPI 开发接口，pytest 回归测试。',
        'jd_text': '必须掌握 Python、FastAPI；Docker 加分。',
        'company': '测试公司',
        'title': 'Python 工程师',
    })
    assert response.status_code == 200, response.text
    return response.json(), material


def test_skill_registry_and_analysis_inputs_are_available(client):
    skills = client.get('/api/skills').json()
    assert {skill['id'] for skill in skills} == SKILL_IDS
    assert all(set(skill) == {'id', 'name', 'description', 'version'} for skill in skills)
    assert all(skill['version'] and skill['description'] for skill in skills)

    report, material = create_analysis(client)
    assert report['inputs'] == {
        'resume_text': '项目：使用 Python 和 FastAPI 开发接口，pytest 回归测试。',
        'jd_text': '必须掌握 Python、FastAPI；Docker 加分。',
        'company': '测试公司',
        'title': 'Python 工程师',
    }
    assert report['evidence'][0]['id'] == material['id']


def test_jd_diagnosis_offline_run_is_grounded_and_saved(client):
    report, material = create_analysis(client)
    response = client.post('/api/skills/jd-diagnosis/run', json={'analysis_id': report['id']})
    assert response.status_code == 200, response.text
    result = response.json()

    assert result['skill_id'] == 'jd-diagnosis'
    assert result['analysis_id'] == report['id']
    assert result['title'] == 'Python 工程师'
    assert result['mode'] == 'offline'
    assert result['model'] == 'offline-rules'
    assert result['usage'] == {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    assert result['sections'] and all(section['items'] for section in result['sections'])
    assert {source['id'] for source in result['sources']} >= {'resume', 'jd', material['id']}
    assert any(item['kind'] == 'fact' and 'jd' in item['source_ids']
               for section in result['sections'] for item in section['items'])
    assert all(set(item) == {'heading', 'content', 'kind', 'source_ids', 'review_required'}
               for section in result['sections'] for item in section['items'])
    assert all(set(source) == {'id', 'title', 'content'} for source in result['sources'])

    history = client.get('/api/skill-runs', params={'analysis_id': report['id']}).json()
    assert [item['id'] for item in history] == [result['id']]
    assert client.get('/api/skill-runs/' + result['id']).json() == result


def test_resume_tailor_and_interview_prep_have_safe_offline_outputs(client):
    report, material = create_analysis(client)
    tailored = client.post('/api/skills/resume-tailor/run', json={'analysis_id': report['id']}).json()
    proposals = [item for section in tailored['sections'] for item in section['items']
                 if item['kind'] == 'proposal']
    assert proposals
    assert all('jd' not in item['source_ids'] for item in proposals)
    assert all(item['source_ids'] for item in proposals)
    assert all(item['review_required'] for item in proposals)

    prep = client.post('/api/skills/interview-prep/run', json={'analysis_id': report['id']}).json()
    kinds = {item['kind'] for section in prep['sections'] for item in section['items']}
    assert {'study', 'question'} <= kinds
    questions = [item for section in prep['sections'] for item in section['items']
                 if item['kind'] == 'question']
    assert questions
    assert all('生成练习' in item['content'] for item in questions)


def test_old_analysis_falls_back_to_structured_report_with_clear_warning(client):
    old = {
        'id': 'old-analysis', 'title': '旧报告', 'company': '旧公司',
        'matched_skills': ['Python'], 'missing_skills': ['Docker'],
        'breakdown': [
            {'skill': 'Python', 'weight': 3, 'matched': True, 'evidence': '使用 Python 开发接口'},
            {'skill': 'Docker', 'weight': 1, 'matched': False, 'evidence': ''},
        ],
        'resume': {'skills': ['Python'], 'experience_years': None,
                   'projects': ['使用 Python 开发接口']},
        'jd': {'skills': [{'name': 'Docker', 'required': False, 'weight': 1}],
               'experience_years': None, 'domain': ''},
        'evidence': [], 'inputs': None,
    }
    store = client.app.state.store
    store.save_analysis(old)
    result = client.post('/api/skills/jd-diagnosis/run', json={'analysis_id': 'old-analysis'}).json()
    sources = {source['id']: source for source in result['sources']}
    assert '使用 Python 开发接口' in sources['resume']['content']
    assert 'Docker' in sources['jd']['content']
    assert any('原始输入不可用' in warning and '结构化结果回退' in warning
               for warning in result['warnings'])


def test_skill_api_validation_and_missing_records(client):
    report, _ = create_analysis(client)
    assert client.post('/api/skills/unknown/run', json={'analysis_id': report['id']}).status_code == 404
    assert client.post('/api/skills/jd-diagnosis/run', json={'analysis_id': 'missing'}).status_code == 404
    assert client.post('/api/skills/jd-diagnosis/run', json={'analysis_id': ' '}).status_code == 422
    assert client.post('/api/skills/jd-diagnosis/run',
                       json={'analysis_id': report['id'], 'path': 'C:/win'}).status_code == 422
    assert client.get('/api/skill-runs/missing').status_code == 404


@pytest.mark.asyncio
async def test_model_proposals_are_source_verified_and_unverified_items_dropped(tmp_path, monkeypatch):
    with TestClient(create_app(Settings(data_dir=tmp_path, llm_mode='offline'))) as client:
        report, material = create_analysis(client)
    calls = []

    async def complete(self, prompt_name, user_text, schema, system_instructions=None, max_tokens=None):
        from app.schemas import SkillPayload
        calls.append((prompt_name, user_text, system_instructions))
        self.usage = {'prompt_tokens': 21, 'completion_tokens': 12, 'total_tokens': 33}
        return SkillPayload.model_validate({'sections': [{
            'title': '模型改写',
            'items': [
                {'heading': '可核实改写', 'content': '围绕真实 Docker 经历补充职责与核对方式。',
                 'kind': 'proposal', 'source_ids': [material['id']],
                 'source_quote': '使用 Docker 打包课程项目', 'review_required': True},
                {'heading': '伪造数字', 'content': '将 Docker 部署规模改写为 5000 台。',
                 'kind': 'proposal', 'source_ids': [material['id']],
                 'source_quote': '使用 Docker 打包课程项目', 'review_required': True},
                {'heading': '错误引用', 'content': '把 JD 要求写成个人经历。',
                 'kind': 'proposal', 'source_ids': ['jd'],
                 'source_quote': 'Docker 加分', 'review_required': True},
            ],
        }]})

    monkeypatch.setattr('app.business_skills.runtime.ModelClient.complete', complete)
    with TestClient(create_app(Settings(data_dir=tmp_path, api_key='test-key', llm_mode='online'))) as client:
        response = client.post('/api/skills/resume-tailor/run', json={'analysis_id': report['id']})
    assert response.status_code == 200, response.text
    result = response.json()
    model_items = [item for section in result['sections'] if section['title'] == '模型改写'
                   for item in section['items']]
    assert [item['heading'] for item in model_items] == ['可核实改写']
    assert model_items[0]['source_ids'] == [material['id']]
    assert result['mode'] == 'degraded'
    assert result['usage']['total_tokens'] == 33
    assert len(calls) == 1
    assert calls[0][0] == 'business_skill'
    assert calls[0][2] and '不得虚构' in calls[0][2]
    assert any('未通过证据核验' in warning for warning in result['warnings'])
    assert any('额外消耗' in warning and '1 次' in warning for warning in result['warnings'])


@pytest.mark.asyncio
async def test_model_failure_degrades_to_offline_result(tmp_path, monkeypatch):
    with TestClient(create_app(Settings(data_dir=tmp_path, llm_mode='offline'))) as client:
        report, _ = create_analysis(client)

    async def fail(self, *args, **kwargs):
        raise ModelUnavailable('模型连接失败')

    monkeypatch.setattr('app.business_skills.runtime.ModelClient.complete', fail)
    with TestClient(create_app(Settings(data_dir=tmp_path, api_key='test-key', llm_mode='online'))) as client:
        response = client.post('/api/skills/interview-prep/run', json={'analysis_id': report['id']})
    assert response.status_code == 200
    result = response.json()
    assert result['mode'] == 'degraded'
    assert result['sections']
    assert any('技能生成已降级' in warning for warning in result['warnings'])


@pytest.mark.asyncio
async def test_model_client_accepts_optional_system_instructions_without_breaking_calls():
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={
            'choices': [{'message': {'content': '{"skills":[{"name":"Python"}]}'}}],
            'usage': {'prompt_tokens': 7, 'completion_tokens': 2},
        })

    client = ModelClient(Settings(api_key='test', llm_mode='online'),
                         transport=httpx.MockTransport(handler), retry_delay=0)
    result = await client.complete('jd', 'Python', JobParsed,
                                   system_instructions='CUSTOM-SKILL-INSTRUCTIONS')
    assert result.skills[0].name == 'Python'
    system = requests[0]['messages'][0]['content']
    assert 'CUSTOM-SKILL-INSTRUCTIONS' in system
    assert '仅提取原文明确出现的技能' in system





def test_model_fact_returns_verified_quote_not_unverified_content(tmp_path, monkeypatch):
    with TestClient(create_app(Settings(data_dir=tmp_path, llm_mode='offline'))) as client:
        report, material = create_analysis(client)

    async def complete(self, *args, **kwargs):
        from app.schemas import SkillPayload
        self.usage = {'prompt_tokens': 5, 'completion_tokens': 3, 'total_tokens': 8}
        return SkillPayload.model_validate({'sections': [{'title': '事实', 'items': [
            {'heading': '看似事实', 'content': '候选人有 10 年 Docker 经验。', 'kind': 'fact',
             'source_ids': [material['id']], 'source_quote': '使用 Docker 打包课程项目'},
        ]}]})

    monkeypatch.setattr('app.business_skills.runtime.ModelClient.complete', complete)
    with TestClient(create_app(Settings(data_dir=tmp_path, api_key='test', llm_mode='online'))) as client:
        result = client.post('/api/skills/jd-diagnosis/run', json={'analysis_id': report['id']}).json()
    facts = [item for section in result['sections'] for item in section['items'] if item['heading'] == '已核实原文摘录']
    assert facts == [{
        'heading': '已核实原文摘录',
        'content': '使用 Docker 打包课程项目',
        'kind': 'fact',
        'source_ids': [material['id']],
        'review_required': False,
    }]


@pytest.mark.asyncio
async def test_numeric_validation_compares_whole_tokens_not_substrings(tmp_path, monkeypatch):
    with TestClient(create_app(Settings(data_dir=tmp_path, llm_mode='offline'))) as client:
        report, _ = create_analysis(client)
    report['evidence'].append({'id': 'numeric-source', 'title': '真实规模', 'content': '集群规模 1600 个节点。'})
    with client.app.state.store.connection() as db:
        db.execute('UPDATE analyses SET payload=? WHERE id=?', (json.dumps(report), report['id']))

    async def complete(self, *args, **kwargs):
        from app.schemas import SkillPayload
        self.usage = {'prompt_tokens': 5, 'completion_tokens': 3, 'total_tokens': 8}
        return SkillPayload.model_validate({'sections': [{'title': '改写', 'items': [
            {'heading': '偷换数字', 'content': '改写为服务 60 个节点。', 'kind': 'proposal',
             'source_ids': ['numeric-source'], 'source_quote': '集群规模 1600 个节点', 'review_required': True},
        ]}]})

    monkeypatch.setattr('app.business_skills.runtime.ModelClient.complete', complete)
    with TestClient(create_app(Settings(data_dir=tmp_path, api_key='test', llm_mode='online'))) as client:
        result = client.post('/api/skills/resume-tailor/run', json={'analysis_id': report['id']}).json()
    headings = [item['heading'] for section in result['sections'] for item in section['items']]
    assert '偷换数字' not in headings
    assert any('未通过证据核验' in warning for warning in result['warnings'])


@pytest.mark.parametrize('skill_id', ['jd-diagnosis', 'resume-tailor'])
def test_offline_sections_and_sources_are_bounded_in_input_order(skill_id):
    from app.business_skills import build_sources, offline_sections
    analysis = {
        'id': 'bounded', 'title': '边界岗位', 'matched_skills': [], 'missing_skills': [],
        'breakdown': [],
        'resume': {'skills': [], 'experience_years': None, 'projects': []},
        'jd': {'skills': [
            {'name': f'Skill{index}', 'required': True, 'weight': 3} for index in range(80)
        ], 'experience_years': None, 'domain': ''},
        'evidence': [
            {'id': f'material-{index}', 'title': f'素材{index}', 'content': f'真实素材 {index}'}
            for index in range(40)
        ],
        'inputs': {'resume_text': '简历', 'jd_text': 'JD'},
    }
    sources, warnings = build_sources(analysis)
    sections = offline_sections(skill_id, analysis, sources)
    assert len(sources) <= 30
    assert all(len(section.items) <= 20 for section in sections)
    assert any('未展示' in item.heading or '未展示' in item.content
               for section in sections for item in section.items)
    assert any('素材来源过多' in warning for warning in warnings)

@pytest.mark.asyncio
async def test_model_sections_are_appended_to_required_offline_sections(tmp_path, monkeypatch):
    with TestClient(create_app(Settings(data_dir=tmp_path, llm_mode='offline'))) as client:
        report, _ = create_analysis(client)

    async def complete(self, *args, **kwargs):
        from app.schemas import SkillPayload
        self.usage = {'prompt_tokens': 5, 'completion_tokens': 3, 'total_tokens': 8}
        return SkillPayload.model_validate({'sections': [{'title': '模型补充', 'items': [
            {'heading': '安全补充', 'content': '补充说明。', 'kind': 'study', 'source_ids': ['jd']},
        ]}]})

    monkeypatch.setattr('app.business_skills.runtime.ModelClient.complete', complete)
    with TestClient(create_app(Settings(data_dir=tmp_path, api_key='test', llm_mode='online'))) as client:
        result = client.post('/api/skills/interview-prep/run', json={'analysis_id': report['id']}).json()
    titles = [section['title'] for section in result['sections']]
    assert '速学知识点与复习顺序' in titles
    assert '预测练习与回答提纲' in titles
    assert '模型补充' in titles


@pytest.mark.asyncio
async def test_proposals_reject_chinese_numbers_unknown_english_and_past_personal_claims(tmp_path, monkeypatch):
    with TestClient(create_app(Settings(data_dir=tmp_path, llm_mode='offline'))) as client:
        report, _ = create_analysis(client)
    report['evidence'].append({'id': 'number-source', 'title': '真实规模', 'content': '真实规模一千六百个节点。'})
    report['evidence'].append({'id': 'snowflake-source', 'title': 'Snowflake', 'content': '维护 Snowflake 数据仓库。'})
    with client.app.state.store.connection() as db:
        db.execute('UPDATE analyses SET payload=? WHERE id=?', (json.dumps(report), report['id']))

    async def complete(self, *args, **kwargs):
        from app.schemas import SkillPayload
        self.usage = {'prompt_tokens': 5, 'completion_tokens': 3, 'total_tokens': 8}
        return SkillPayload.model_validate({'sections': [
            {'title': '改写', 'items': [
                {'heading': '中文数字偷换', 'content': '改写为服务六十个节点。', 'kind': 'proposal',
                 'source_ids': ['number-source'], 'source_quote': '真实规模一千六百个节点', 'review_required': True},
                {'heading': '未知英文技术', 'content': '引入 Snowflake 编排。', 'kind': 'proposal',
                 'source_ids': [report['evidence'][0]['id']], 'source_quote': '使用 Docker 打包课程项目', 'review_required': True},
            ]},
            {'title': '练习', 'items': [
                {'heading': '伪经历练习', 'content': '生成练习：你曾负责 Snowflake 数据平台。', 'kind': 'question',
                 'source_ids': ['snowflake-source']},
            ]},
        ]})

    monkeypatch.setattr('app.business_skills.runtime.ModelClient.complete', complete)
    with TestClient(create_app(Settings(data_dir=tmp_path, api_key='test', llm_mode='online'))) as client:
        result = client.post('/api/skills/resume-tailor/run', json={'analysis_id': report['id']}).json()
    headings = [item['heading'] for section in result['sections'] for item in section['items']]
    assert '中文数字偷换' not in headings
    assert '未知英文技术' not in headings
    assert '伪经历练习' not in headings


def test_interview_offline_uses_gap_first_then_matched_and_limits_to_six():
    from app.business_skills import build_sources, offline_sections
    analysis = {
        'id': 'interview-order', 'title': '岗位', 'matched_skills': ['Python', 'FastAPI', 'pytest'],
        'missing_skills': ['Docker', 'RAG', 'Agent', 'ChromaDB', 'Redis', 'Kafka', 'Elasticsearch'],
        'breakdown': [], 'resume': {'skills': [], 'experience_years': None, 'projects': []},
        'jd': {'skills': [], 'experience_years': None, 'domain': ''}, 'evidence': [],
        'inputs': {'resume_text': '简历', 'jd_text': 'JD'},
    }
    sources, _ = build_sources(analysis)
    sections = offline_sections('interview-prep', analysis, sources)
    study = [item for section in sections if section.title == '速学知识点与复习顺序' for item in section.items]
    assert len(study) == 6
    assert study[0].heading == '速学路径：Docker'
    assert '速学路径：Python' in [item.heading for item in study]

def test_offline_knowledge_card_preserves_concept_string():
    from app.business_skills import build_sources, offline_sections
    analysis = {
        'id': 'knowledge', 'title': '岗位', 'matched_skills': [], 'missing_skills': ['Docker'],
        'breakdown': [], 'resume': {'skills': [], 'experience_years': None, 'projects': []},
        'jd': {'skills': [], 'experience_years': None, 'domain': ''}, 'evidence': [],
        'inputs': {'resume_text': '简历', 'jd_text': 'JD'},
    }
    sections = offline_sections('interview-prep', analysis, build_sources(analysis)[0])
    study = [item for section in sections for item in section.items if item.heading == '速学路径：Docker'][0]
    assert '知识点：数据类型、可变对象与默认参数陷阱' not in study.content
    assert '知识点：镜像；分层与构建缓存；容器可写层' in study.content


@pytest.mark.asyncio
async def test_model_question_with_existing_prefix_keeps_marker(tmp_path, monkeypatch):
    with TestClient(create_app(Settings(data_dir=tmp_path, llm_mode='offline'))) as client:
        report, _ = create_analysis(client)
    prefix = '生成练习（非真实面试题或个人经历断言）：'

    async def complete(self, *args, **kwargs):
        from app.schemas import SkillPayload
        self.usage = {'prompt_tokens': 4, 'completion_tokens': 2, 'total_tokens': 6}
        return SkillPayload.model_validate({'sections': [{'title': '练习', 'items': [
            {'heading': '已有前缀', 'content': prefix + '解释 Docker 卷和容器可写层差异。',
             'kind': 'question', 'source_ids': ['jd']},
        ]}]})

    monkeypatch.setattr('app.business_skills.runtime.ModelClient.complete', complete)
    with TestClient(create_app(Settings(data_dir=tmp_path, api_key='test', llm_mode='online'))) as client:
        result = client.post('/api/skills/interview-prep/run', json={'analysis_id': report['id']}).json()
    items = [item for section in result['sections'] for item in section['items'] if item['heading'] == '已有前缀']
    assert items[0]['content'].startswith(prefix)

@pytest.mark.asyncio
async def test_business_skill_model_call_uses_bounded_output_budget(tmp_path, monkeypatch):
    with TestClient(create_app(Settings(data_dir=tmp_path, llm_mode='offline'))) as client:
        report, _ = create_analysis(client)
    calls = []

    async def complete(self, prompt_name, user_text, schema, system_instructions=None, max_tokens=None):
        from app.schemas import SkillPayload
        calls.append(max_tokens)
        self.usage = {'prompt_tokens': 5, 'completion_tokens': 3, 'total_tokens': 8}
        return SkillPayload.model_validate({'sections': []})

    monkeypatch.setattr('app.business_skills.runtime.ModelClient.complete', complete)
    with TestClient(create_app(Settings(data_dir=tmp_path, api_key='test', llm_mode='online'))) as client:
        result = client.post('/api/skills/jd-diagnosis/run', json={'analysis_id': report['id']})
    assert result.status_code == 200, result.text
    assert calls == [1200]


def test_business_skill_prompt_bounds_model_supplement():
    prompt = Path('backend/app/prompts/business_skill.txt').read_text(encoding='utf-8')
    assert '2-3 个补充 section' in prompt
    assert '合计不超过 6 个 item' in prompt
    assert '每条 100-150 个中文字符' in prompt
    assert '不要重复离线结构中的基础规则' in prompt

@pytest.mark.asyncio
async def test_prefixing_a_4000_character_generated_question_cannot_cause_500(tmp_path, monkeypatch):
    with TestClient(create_app(Settings(data_dir=tmp_path, llm_mode='offline'))) as client:
        report, _ = create_analysis(client)

    async def complete(self, *args, **kwargs):
        from app.schemas import SkillPayload
        self.usage = {'prompt_tokens': 5, 'completion_tokens': 3, 'total_tokens': 8}
        return SkillPayload.model_validate({'sections': [{'title': '过长模型补充', 'items': [
            {'heading': '边界问题', 'content': '问' * 4000, 'kind': 'question', 'source_ids': ['jd']},
        ]}]})

    monkeypatch.setattr('app.business_skills.runtime.ModelClient.complete', complete)
    with TestClient(create_app(Settings(data_dir=tmp_path, api_key='test', llm_mode='online'))) as client:
        response = client.post('/api/skills/interview-prep/run', json={'analysis_id': report['id']})

    assert response.status_code == 200, response.text
    result = response.json()
    headings = [item['heading'] for section in result['sections'] for item in section['items']]
    assert '边界问题' not in headings
    assert any('未通过证据核验或输出边界' in warning for warning in result['warnings'])


def test_overlong_original_fact_is_not_truncated_to_4000_characters():
    from app.business_skills import build_sources, offline_sections
    original = '真' * 4001
    analysis = {
        'id': 'long-source', 'title': '岗位', 'matched_skills': [], 'missing_skills': [],
        'breakdown': [], 'resume': {'skills': [], 'experience_years': None, 'projects': []},
        'jd': {'skills': [], 'experience_years': None, 'domain': ''},
        'evidence': [{'id': 'long-material', 'title': '长原文', 'content': original}],
        'inputs': {'resume_text': '简历', 'jd_text': 'JD'},
    }
    sources = build_sources(analysis)[0]
    sections = offline_sections('resume-tailor', analysis, sources)
    facts = [item for section in sections for item in section.items if item.heading == '真实素材：长原文']

    assert facts
    assert facts[0].content != original[:4000]
    assert '超过单条结果 4000 字符展示上限' in facts[0].content
    assert original[:4000] not in facts[0].content
