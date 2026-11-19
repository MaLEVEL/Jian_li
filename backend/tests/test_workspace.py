import json

import pytest
from app.config import DEFAULT_EXTENSION_ORIGIN, Settings
from app.main import create_app
from fastapi.testclient import TestClient

MAX_STATE_BYTES = 2 * 1024 * 1024


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline'))) as value:
        yield value


def workspace_state(**changes):
    return {
        'profile': {
            'name': '测试用户',
            'email': 'test@example.com',
            'phone': '',
            'location': '上海',
            'targetRole': 'Python 工程师',
            'headline': '',
            'education': '',
            'skills': '',
            'projects': '',
            'experience': '',
            'awards': '',
        },
        'resumes': [],
        'applications': [],
        'version': 1,
        'exportedAt': '2026-11-18T10:00:00.000Z',
        **changes,
    }


def resume_record(**changes):
    return {
        'id': 'resume-1',
        'title': 'Python 后端简历',
        'source': 'generated',
        'template': 'graduate',
        'identity': {
            'name': '测试用户',
            'email': 'test@example.com',
            'phone': '13800000000',
            'location': '上海',
        },
        'targetRole': 'Python 工程师',
        'company': '示例公司',
        'jobTitle': '后端工程师',
        'parentResumeId': None,
        'appearance': {
            'fontFamily': 'sans',
            'fontSize': 10.5,
            'lineHeight': 1.5,
            'pageMargin': 12,
            'pageCount': 1,
            'accent': '#2457d6',
        },
        'sections': {
            'summary': '五年 Python 服务开发经验。',
            'skills': ['Python', 'FastAPI', 'SQLite'],
            'education': ['计算机科学本科'],
            'projects': ['高并发任务平台'],
            'experience': ['负责后端服务开发'],
            'awards': [],
        },
        'plainText': '测试用户\nPython / FastAPI / SQLite',
        'unsupportedClaims': ['2025'],
        'reviewed': True,
        'createdAt': '2026-11-18T10:00:00.000Z',
        'updatedAt': '2026-11-18T10:00:00.000Z',
        **changes,
    }


def match_report(**changes):
    return {
        'score': 86,
        'weightedCoverage': 82,
        'skillCoverage': 90,
        'projectCoverage': 74,
        'matchedKeywords': ['Python', 'FastAPI'],
        'missingKeywords': ['Kubernetes'],
        'scoreBreakdown': ['技能 90%', '项目 74%'],
        'strengths': ['服务端经验匹配'],
        'gaps': ['容器编排经验不足'],
        'suggestions': ['补充部署与可观测性案例'],
        'optimizedBullets': ['使用 FastAPI 交付核心接口'],
        **changes,
    }


def application_record(**changes):
    return {
        'id': 'application-1',
        'job': {
            'company': '示例公司',
            'title': 'Python 后端工程师',
            'description': '负责 FastAPI 服务、SQLite 数据层与自动化测试。',
        },
        'status': 'applied',
        'appliedAt': '2026-11-18T11:00:00.000Z',
        'channel': 'BOSS',
        'hrContact': '招聘负责人',
        'followUpAt': '2026-11-20T10:00:00.000Z',
        'interviewAt': '',
        'notes': '已发送定制简历，等待反馈。',
        'resumeId': 'resume-1',
        'resumeTitle': 'Python 后端简历',
        'report': match_report(),
        'questions': {
            'technical': ['如何设计幂等 upsert？'],
            'project': ['介绍高并发任务平台'],
            'behavioral': ['如何处理跨团队分歧？'],
        },
        'createdAt': '2026-11-18T11:00:00.000Z',
        'updatedAt': '2026-11-18T11:00:00.000Z',
        **changes,
    }


def put_workspace(client, state, expected_revision):
    return client.put('/api/workspace', json={
        'state': state,
        'expected_revision': expected_revision,
    })


def test_workspace_is_empty_then_can_be_written_and_read(client):
    assert client.get('/api/workspace').status_code == 404

    response = put_workspace(client, workspace_state(), None)

    assert response.status_code == 200, response.text
    envelope = response.json()
    assert envelope['state'] == workspace_state()
    assert envelope['revision'] == 1
    assert envelope['updated_at']
    assert client.get('/api/workspace').json() == envelope


def test_workspace_revision_increments_on_each_write(client):
    first = put_workspace(client, workspace_state(), None)
    assert first.status_code == 200
    assert first.json()['revision'] == 1

    changed = workspace_state(profile={**workspace_state()['profile'], 'headline': '第二版'})
    second = put_workspace(client, changed, 1)

    assert second.status_code == 200, second.text
    assert second.json()['revision'] == 2
    assert second.json()['state']['profile']['headline'] == '第二版'
    assert client.get('/api/workspace').json()['revision'] == 2


def test_workspace_accepts_complete_frontend_camel_case_payload(client):
    state = workspace_state(
        resumes=[resume_record()],
        applications=[application_record()],
    )

    response = put_workspace(client, state, None)

    assert response.status_code == 200, response.text
    assert response.json()['state'] == state
    stored = client.get('/api/workspace').json()
    assert stored['state']['resumes'][0]['appearance']['fontFamily'] == 'sans'
    assert stored['state']['applications'][0]['report']['matchedKeywords'] == ['Python', 'FastAPI']
    assert stored['state']['applications'][0]['questions']['technical'] == ['如何设计幂等 upsert？']


def test_workspace_stale_revision_returns_409_with_current_envelope(client):
    assert put_workspace(client, workspace_state(), None).status_code == 200
    current = put_workspace(
        client,
        workspace_state(profile={**workspace_state()['profile'], 'headline': '设备 A 的版本'}),
        1,
    )
    assert current.status_code == 200
    current_envelope = current.json()
    assert current_envelope['revision'] == 2

    stale = put_workspace(
        client,
        workspace_state(profile={**workspace_state()['profile'], 'headline': '设备 B 的覆盖'}),
        1,
    )

    assert stale.status_code == 409
    assert stale.json() == {'detail': '服务器工作区已被更新。', 'current': current_envelope}
    assert client.get('/api/workspace').json() == current_envelope


@pytest.mark.parametrize('state', [
workspace_state(profile={**workspace_state()['profile'], 'headline': 'sk-live-secret-value'}),
    workspace_state(profile={**workspace_state()['profile'], 'headline': 'Bearer abcdefghijklmnopqrstuvwxyz'}),
    workspace_state(profile={**workspace_state()['profile'], 'notes': 'sk-live-secret'}),
    workspace_state(profile={**workspace_state()['profile'], 'model': 'shadow-model'}),
    workspace_state(profile={**workspace_state()['profile'], 'key': 'shadow-key'}),
    workspace_state(profile={**workspace_state()['profile'], 'endpoint': 'https://provider.example'}),
    workspace_state(resumes=[resume_record(settings={'providerConfig': {'apiKey': 'sk-live-secret'}})]),
    workspace_state(applications=[application_record(
        report=match_report(internalTrace=[{'apiKey': 'sk-live-secret'}]))
    ]),
    {**workspace_state(), 'api_key': 'top-level-secret'},
])
def test_workspace_rejects_unknown_fields_and_provider_configuration_anywhere(client, state):
    response = put_workspace(client, state, None)

    assert response.status_code == 422
    assert client.get('/api/workspace').status_code == 404
    assert 'secret' not in response.text


@pytest.mark.parametrize('state', [
workspace_state(profile={**workspace_state()['profile'], 'headline': 'sk-live-secret-value'}),
    workspace_state(profile={**workspace_state()['profile'], 'headline': 'Bearer abcdefghijklmnopqrstuvwxyz'}),
    workspace_state(resumes=[{} for _ in range(101)]),
    workspace_state(applications=[{} for _ in range(1001)]),
])
def test_workspace_rejects_unreasonable_list_sizes(client, state):
    response = put_workspace(client, state, None)
    assert response.status_code == 422


def test_workspace_rejects_state_larger_than_two_megabytes(client):
    state = workspace_state(resumes=[resume_record(plainText='x' * MAX_STATE_BYTES)])

    response = put_workspace(client, state, None)

    assert response.status_code == 422
    assert client.get('/api/workspace').status_code == 404


def test_workspace_state_size_is_utf8_bytes_not_python_characters(client):
    # Multi-byte UTF-8 content must be charged by serialized byte length.
    state = workspace_state(resumes=[resume_record(plainText='中' * (MAX_STATE_BYTES // 3 + 1))])
    serialized = json.dumps(state, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    assert len(serialized) > MAX_STATE_BYTES

    response = put_workspace(client, state, None)
    assert response.status_code == 422


def test_workspace_expected_revision_zero_is_a_conflict_after_initial_write(client):
    first = put_workspace(client, workspace_state(), None)
    assert first.status_code == 200
    stale = put_workspace(client, workspace_state(), 0)
    assert stale.status_code == 409
    assert stale.json()['detail'] == '服务器工作区已被更新。'
    assert stale.json()['current']['revision'] == 1

def test_workspace_allows_same_origin_put(client):
    response = client.put(
        '/api/workspace',
        json={'state': workspace_state(), 'expected_revision': None},
        headers={'Origin': 'http://testserver'},
    )
    assert response.status_code == 200

def test_workspace_put_is_allowed_by_cors_preflight(client):
    response = client.options('/api/workspace', headers={
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
    })

    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == 'http://localhost:5173'
    assert 'PUT' in response.headers['access-control-allow-methods']


def test_cors_exposes_boss_pagination_headers(client):
    response = client.get('/api/health', headers={'Origin': 'http://localhost:5173'})

    assert response.status_code == 200
    assert 'X-Total-Count' in response.headers['access-control-expose-headers']


def test_untrusted_host_is_rejected_before_workspace_read(client):
    first = put_workspace(client, workspace_state(), None)
    assert first.status_code == 200

    response = client.get(
        '/api/workspace',
        headers={'Host': 'evil.example', 'Origin': 'http://evil.example'},
    )

    assert response.status_code == 400
    assert 'Host' in response.json()['detail']


def test_dns_rebinding_style_mutation_with_untrusted_origin_is_rejected(client):
    response = client.put(
        '/api/workspace',
        json={'state': workspace_state(), 'expected_revision': None},
        headers={'Origin': 'http://evil.example'},
    )

    assert response.status_code == 403
    assert client.get('/api/workspace').status_code == 404


def test_stable_chrome_extension_origin_is_allowed(client):
    response = client.options('/api/boss/jobs/import', headers={
        'Origin': DEFAULT_EXTENSION_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
    })

    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == DEFAULT_EXTENSION_ORIGIN
