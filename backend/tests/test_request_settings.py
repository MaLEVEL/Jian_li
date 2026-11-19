import json

import pytest
from app.config import Settings
from app.llm import ModelUnavailable
from app.main import create_app
from fastapi.testclient import TestClient

OVERRIDE_HEADERS = {
    'X-API-Key': 'request-secret-key',
    'X-API-Base-URL': 'https://request.example/v1',
    'X-Model': 'request-model',
}


def analysis_payload():
    return {
        'resume_text': '项目使用 Python 和 FastAPI。',
        'jd_text': '要求掌握 Python。',
        'company': '测试公司',
        'title': 'Python 工程师',
    }


def test_analyze_without_override_headers_uses_offline_server_policy(tmp_path, monkeypatch):
    captured = []

    async def capture(request, settings, store, retriever):
        captured.append(settings)
        return {'id': 'analysis-1'}

    server_settings = Settings(
        _env_file=None,
        data_dir=tmp_path,
        base_url='https://server.example/v1/',
        model='server-model',
        llm_mode='auto',
    )
    monkeypatch.setattr('app.main.run_analysis', capture)
    with TestClient(create_app(server_settings)) as client:
        response = client.post('/api/analyze', json=analysis_payload())

    assert response.status_code == 200, response.text
    assert len(captured) == 1
    assert captured[0] is server_settings
    assert captured[0].online is False


def test_analyze_uses_complete_request_override_in_memory(tmp_path, monkeypatch):
    captured = []

    async def capture(request, settings, store, retriever):
        captured.append(settings)
        return {'id': 'analysis-1'}

    server_settings = Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline')
    monkeypatch.setattr('app.main.run_analysis', capture)
    with TestClient(create_app(server_settings)) as client:
        response = client.post('/api/analyze', json=analysis_payload(), headers=OVERRIDE_HEADERS)

    assert response.status_code == 200, response.text
    assert len(captured) == 1
    request_settings = captured[0]
    assert request_settings is not server_settings
    assert request_settings.online is True
    assert request_settings.api_key.get_secret_value() == OVERRIDE_HEADERS['X-API-Key']
    assert request_settings.base_url == 'https://request.example/v1/'
    assert request_settings.model == OVERRIDE_HEADERS['X-Model']
    assert OVERRIDE_HEADERS['X-API-Key'] not in response.text


def test_partial_override_headers_are_rejected_without_using_another_key(tmp_path, monkeypatch):
    called = False

    async def capture(request, settings, store, retriever):
        nonlocal called
        called = True
        return {'id': 'analysis-1'}

    server_settings = Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline')
    monkeypatch.setattr('app.main.run_analysis', capture)
    with TestClient(create_app(server_settings)) as client:
        response = client.post(
            '/api/analyze',
            json=analysis_payload(),
            headers={'X-API-Base-URL': 'https://partial.example/v1/', 'X-Model': 'partial-model'},
        )

    assert response.status_code == 422
    assert called is False


def test_server_api_key_environment_variable_is_ignored(monkeypatch, tmp_path):
    monkeypatch.setenv('JOBFIT_API_KEY', 'must-not-be-read-from-environment')
    settings = Settings(_env_file=None, data_dir=tmp_path, llm_mode='auto')

    assert settings.api_key.get_secret_value() == ''
    assert settings.online is False
    assert 'api_key' not in settings.model_dump()


def test_offline_mode_still_works_with_empty_override_headers(tmp_path, monkeypatch):
    captured = []

    async def capture(request, settings, store, retriever):
        captured.append(settings)
        return {'id': 'analysis-1'}

    server_settings = Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline')
    monkeypatch.setattr('app.main.run_analysis', capture)
    with TestClient(create_app(server_settings)) as client:
        response = client.post(
            '/api/analyze',
            json=analysis_payload(),
            headers={'X-API-Key': '', 'X-API-Base-URL': ' ', 'X-Model': ''},
        )

    assert response.status_code == 200, response.text
    assert captured == [server_settings]
    assert captured[0].online is False


@pytest.mark.parametrize('base_url', ['javascript:alert(1)', 'ftp://request.example/v1/', 'https:///missing-host'])
def test_invalid_override_base_url_returns_422_without_leaking_key(tmp_path, monkeypatch, base_url):
    called = False

    async def capture(request, settings, store, retriever):
        nonlocal called
        called = True
        return {'id': 'analysis-1'}

    monkeypatch.setattr('app.main.run_analysis', capture)
    headers = {**OVERRIDE_HEADERS, 'X-API-Base-URL': base_url, 'X-API-Key': 'never-echo-this-key'}
    with TestClient(create_app(Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline'))) as client:
        response = client.post('/api/analyze', json=analysis_payload(), headers=headers)

    assert response.status_code == 422
    assert called is False
    assert 'never-echo-this-key' not in response.text


@pytest.mark.parametrize('header,value', [
    ('X-API-Key', 'k' * 513),
    ('X-API-Base-URL', 'https://request.example/' + 'a' * 2048),
    ('X-Model', 'm' * 201),
])
def test_override_header_lengths_are_limited(tmp_path, header, value):
    with TestClient(create_app(Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline'))) as client:
        response = client.post(
            '/api/analyze',
            json=analysis_payload(),
            headers={**OVERRIDE_HEADERS, header: value},
        )
    assert response.status_code == 422
    assert response.json()['detail'] == '请求级模型配置无效：请检查请求头格式和长度。'


def test_override_key_is_not_saved_in_report_or_sqlite_payload(tmp_path, monkeypatch):
    secret = 'header-only-secret-never-persist'

    async def fail(self, *args, **kwargs):
        raise ModelUnavailable('测试中不调用真实模型')

    monkeypatch.setattr('app.graph.ModelClient.complete', fail)
    server_settings = Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline')
    headers = {**OVERRIDE_HEADERS, 'X-API-Key': secret}
    with TestClient(create_app(server_settings)) as client:
        response = client.post('/api/analyze', json=analysis_payload(), headers=headers)
        report = response.json()
        persisted = client.app.state.store.analysis(report['id'])

    assert response.status_code == 200, response.text
    assert secret not in response.text
    assert secret not in json.dumps(persisted, ensure_ascii=False)
    assert secret.encode() not in (tmp_path / 'jobfit.sqlite3').read_bytes()


@pytest.mark.parametrize('path', ['/api/batch', '/api/batch/export'])
def test_batch_paths_use_request_override(tmp_path, monkeypatch, path):
    captured = []

    async def capture(request, settings, store, retriever):
        captured.append(settings)
        return {
            'id': 'analysis-1',
            'company': request.company,
            'title': request.title,
            'score': 100,
            'missing_skills': [],
            'mode': 'online',
        }

    monkeypatch.setattr('app.main.run_analysis', capture)
    payload = {
        'resume_text': 'Python',
        'jobs': [{'title': '岗位一', 'jd_text': 'Python'}, {'title': '岗位二', 'jd_text': 'Python'}],
    }
    with TestClient(create_app(Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline'))) as client:
        response = client.post(path, json=payload, headers=OVERRIDE_HEADERS)

    assert response.status_code == 200, response.text
    assert len(captured) == 2
    for settings in captured:
        assert settings.online is True
        assert settings.api_key.get_secret_value() == OVERRIDE_HEADERS['X-API-Key']
        assert settings.base_url == 'https://request.example/v1/'
        assert settings.model == OVERRIDE_HEADERS['X-Model']


def test_skill_path_uses_request_override(tmp_path, monkeypatch):
    captured = []

    async def capture_skill(package, analysis, settings, store):
        captured.append(settings)
        return {'id': 'skill-run-1'}

    monkeypatch.setattr('app.main.run_skill', capture_skill)
    server_settings = Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline')
    with TestClient(create_app(server_settings)) as client:
        client.app.state.store.save_analysis({'id': 'analysis-1'})
        response = client.post(
            '/api/skills/jd-diagnosis/run',
            json={'analysis_id': 'analysis-1'},
            headers=OVERRIDE_HEADERS,
        )

    assert response.status_code == 200, response.text
    assert len(captured) == 1
    assert captured[0].online is True
    assert captured[0].api_key.get_secret_value() == OVERRIDE_HEADERS['X-API-Key']
    assert captured[0].base_url == 'https://request.example/v1/'
    assert captured[0].model == OVERRIDE_HEADERS['X-Model']
