import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from app.config import Settings
from app.main import create_app
from app.store import Store
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path):
    settings = Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline', allowed_hosts='testserver')
    with TestClient(create_app(settings)) as value:
        yield value


def boss_job(source_job_id='boss-001', **changes):
    return {
        'source_job_id': source_job_id,
        'source_url': f'https://www.zhipin.com/job_detail/{source_job_id}.html',
        'company': '测试公司',
        'title': 'Python 后端工程师',
        'location': '上海',
        'salary': '20-30K',
        'experience': '3-5年',
        'education': '本科',
        'description': '负责 FastAPI 服务开发。',
        'recruiter_name': '招聘者',
        'recruiter_title': '技术招聘',
        'tags': ['Python', 'FastAPI', 'Python'],
        'fetched_at': '2026-11-18T10:00:00Z',
        **changes,
    }


def import_jobs(client, jobs):
    return client.post('/api/boss/jobs/import', json={'jobs': jobs})


def test_boss_import_is_idempotent_and_preserves_identity(client):
    first = import_jobs(client, [boss_job('boss-001')])
    assert first.status_code == 200, first.text
    assert first.json() == {'imported': 1, 'updated': 0, 'total': 1}

    initial = client.get('/api/boss/jobs').json()[0]
    assert initial['source'] == 'boss'
    assert initial['tags'] == ['Python', 'FastAPI']
    assert initial['id']
    assert initial['created_at']
    assert initial['updated_at']

    second = import_jobs(client, [boss_job('boss-001', title='高级 Python 后端工程师')])
    assert second.status_code == 200, second.text
    assert second.json() == {'imported': 0, 'updated': 1, 'total': 1}

    detail = client.get(f"/api/boss/jobs/{initial['id']}")
    assert detail.status_code == 200
    updated = detail.json()
    assert updated['id'] == initial['id']
    assert updated['created_at'] == initial['created_at']
    assert updated['updated_at'] >= initial['updated_at']
    assert updated['title'] == '高级 Python 后端工程师'
    assert len(client.get('/api/boss/jobs').json()) == 1



def test_boss_detail_import_preserves_non_empty_list_summary_fields(client):
    summary = boss_job(
        'boss-001',
        location='上海·浦东新区',
        salary='25-35K·14薪',
        experience='3-5年',
        education='本科',
        description='',
        recruiter_name='',
        recruiter_title='',
        tags=['Python', 'FastAPI'],
    )
    assert import_jobs(client, [summary]).status_code == 200

    detail = boss_job(
        'boss-001',
        source_url='https://www.zhipin.com/job_detail/boss-001.html?securityId=detail',
        location='  ',
        salary='',
        experience='',
        education='',
        description='负责 Agent 平台后端开发。',
        recruiter_name='王女士',
        recruiter_title='技术招聘',
        tags=[],
        fetched_at='2026-11-18T11:00:00Z',
    )
    response = import_jobs(client, [detail])
    assert response.status_code == 200, response.text

    stored = client.get('/api/boss/jobs').json()[0]
    assert stored['location'] == '上海·浦东新区'
    assert stored['salary'] == '25-35K·14薪'
    assert stored['experience'] == '3-5年'
    assert stored['education'] == '本科'
    assert stored['tags'] == ['Python', 'FastAPI']
    assert stored['description'] == '负责 Agent 平台后端开发。'
    assert stored['recruiter_name'] == '王女士'
    assert stored['recruiter_title'] == '技术招聘'
    assert stored['source_url'].endswith('securityId=detail')
    assert stored['fetched_at'] == '2026-11-18T11:00:00Z'


def test_boss_summary_import_preserves_non_empty_detail_fields(client):
    detail = boss_job(
        'boss-001',
        source_url='https://www.zhipin.com/job_detail/boss-001.html?securityId=detail',
        description='详情页中的完整岗位描述。',
        recruiter_name='王女士',
        recruiter_title='技术招聘',
        tags=['Python', 'Agent'],
    )
    assert import_jobs(client, [detail]).status_code == 200

    summary = boss_job(
        'boss-001',
        location='杭州·西湖区',
        salary='30-45K',
        description='',
        recruiter_name='',
        recruiter_title='',
        tags=[],
        fetched_at='2026-11-18T12:00:00Z',
    )
    response = import_jobs(client, [summary])
    assert response.status_code == 200, response.text

    stored = client.get('/api/boss/jobs').json()[0]
    assert stored['location'] == '杭州·西湖区'
    assert stored['salary'] == '30-45K'
    assert stored['description'] == '详情页中的完整岗位描述。'
    assert stored['recruiter_name'] == '王女士'
    assert stored['recruiter_title'] == '技术招聘'
    assert stored['tags'] == ['Python', 'Agent']
    assert stored['fetched_at'] == '2026-11-18T12:00:00Z'


def test_boss_reimport_updates_fields_with_non_empty_values(client):
    assert import_jobs(client, [boss_job('boss-001')]).status_code == 200
    update = boss_job(
        'boss-001',
        title='高级 Python Agent 工程师',
        location='深圳·南山区',
        salary='35-50K',
        description='',
        tags=['Python', 'LangGraph'],
        fetched_at='2026-11-18T13:00:00Z',
    )
    response = import_jobs(client, [update])
    assert response.status_code == 200, response.text

    stored = client.get('/api/boss/jobs').json()[0]
    assert stored['title'] == '高级 Python Agent 工程师'
    assert stored['location'] == '深圳·南山区'
    assert stored['salary'] == '35-50K'
    assert stored['tags'] == ['Python', 'LangGraph']
    assert stored['description'] == '负责 FastAPI 服务开发。'
    assert stored['fetched_at'] == '2026-11-18T13:00:00Z'


def test_boss_jobs_list_by_latest_update_and_health_count(client):
    assert import_jobs(client, [boss_job('boss-001')]).status_code == 200
    assert import_jobs(client, [boss_job('boss-002')]).status_code == 200
    assert import_jobs(client, [boss_job('boss-001', title='刚刚更新')]).status_code == 200

    jobs = client.get('/api/boss/jobs').json()
    assert [job['source_job_id'] for job in jobs] == ['boss-001', 'boss-002']
    assert client.get('/api/boss/health').json() == {
        'status': 'ok',
        'source': 'boss',
        'count': 2,
        'capabilities': ['import', 'list', 'get', 'delete'],
    }


def test_boss_job_pool_is_paginated_and_exposes_total(client):
    jobs = [boss_job(str(index)) for index in range(3)]
    assert import_jobs(client, jobs).status_code == 200

    page = client.get('/api/boss/jobs?limit=1&offset=1')

    assert page.status_code == 200
    assert len(page.json()) == 1
    assert page.headers['X-Total-Count'] == '3'
    assert page.headers['X-Limit'] == '1'
    assert page.headers['X-Offset'] == '1'


def test_boss_job_detail_and_delete(client):
    assert import_jobs(client, [boss_job('boss-001')]).status_code == 200
    item = client.get('/api/boss/jobs').json()[0]

    detail = client.get(f"/api/boss/jobs/{item['id']}")
    assert detail.status_code == 200
    assert detail.json() == item

    deleted = client.delete(f"/api/boss/jobs/{item['id']}")
    assert deleted.status_code == 204
    assert deleted.content == b''
    assert client.get(f"/api/boss/jobs/{item['id']}").status_code == 404
    assert client.delete(f"/api/boss/jobs/{item['id']}").status_code == 404
    assert client.get('/api/boss/jobs').json() == []


@pytest.mark.parametrize('field,value', [
    ('source_url', 'javascript:alert(1)'),
    ('source_url', 'https://example.com/job/1'),
    ('source', 'liepin'),
])
def test_boss_rejects_unsafe_url_and_wrong_source(client, field, value):
    response = import_jobs(client, [boss_job(**{field: value})])
    assert response.status_code == 422
    assert client.get('/api/boss/jobs').json() == []


@pytest.mark.parametrize('jobs', [[], [boss_job(str(index)) for index in range(51)]])
def test_boss_batch_size_is_limited(client, jobs):
    assert import_jobs(client, jobs).status_code == 422


def test_boss_accepts_safe_zhipin_url_with_query(client):
    source_url = 'https://www.zhipin.com/job_detail/boss-001.html?securityId=safe-value'
    response = import_jobs(client, [boss_job('boss-001', source_url=source_url)])
    assert response.status_code == 200, response.text
    assert client.get('/api/boss/jobs').json()[0]['source_url'] == source_url


def test_concurrent_boss_imports_share_one_canonical_identity(tmp_path):
    store = Store(tmp_path / 'jobfit.sqlite3')
    barrier = Barrier(2)

    def upsert(title):
        barrier.wait()
        return store.upsert_boss_jobs([boss_job('boss-concurrent', source='boss', title=title)])

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(upsert, ['并发版本 A', '并发版本 B']))

    assert sum(result['imported'] for result in results) == 1
    assert sum(result['updated'] for result in results) == 1
    assert all(result['total'] == 1 for result in results)
    with sqlite3.connect(store.path) as db:
        rows = db.execute(
            'SELECT id, created_at, updated_at, payload FROM boss_jobs '
            'WHERE source=? AND source_job_id=?',
            ('boss', 'boss-concurrent'),
        ).fetchall()
    assert len(rows) == 1
    database_id, database_created_at, database_updated_at, payload_text = rows[0]
    payload = json.loads(payload_text)
    assert payload['id'] == database_id
    assert payload['created_at'] == database_created_at
    assert payload['updated_at'] == database_updated_at
    assert store.boss_job_count() == 1


def test_boss_cors_allows_configured_origin_and_custom_headers(client):
    response = client.options('/api/boss/jobs/import', headers={
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-api-key,x-api-base-url,x-model',
    })
    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == 'http://localhost:5173'
    allowed = response.headers['access-control-allow-headers'].lower()
    assert {'content-type', 'x-api-key', 'x-api-base-url', 'x-model'} <= {
        value.strip() for value in allowed.split(',')
    }

    rejected = client.options('/api/boss/jobs/import', headers={
        'Origin': 'https://attacker.example',
        'Access-Control-Request-Method': 'POST',
    })
    assert rejected.status_code == 400
    assert 'access-control-allow-origin' not in rejected.headers


def test_boss_post_rejects_untrusted_web_origin_before_mutation(client):
    response = client.post(
        '/api/boss/jobs/import',
        json={'jobs': [boss_job()]},
        headers={'Origin': 'https://attacker.example'},
    )

    assert response.status_code == 403
    assert response.json() == {'detail': '请求来源不在允许列表中。'}
    assert 'access-control-allow-origin' not in response.headers
    assert client.get('/api/boss/jobs').json() == []


def test_boss_post_allows_exact_configured_web_origin(client):
    response = client.post(
        '/api/boss/jobs/import',
        json={'jobs': [boss_job()]},
        headers={'Origin': 'http://localhost:5173'},
    )

    assert response.status_code == 200, response.text
    assert response.headers['access-control-allow-origin'] == 'http://localhost:5173'
    assert client.get('/api/boss/jobs').json()[0]['source_job_id'] == 'boss-001'


def test_boss_post_allows_explicit_chrome_extension_origin(tmp_path):
    extension_origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'
    settings = Settings(
        _env_file=None,
        data_dir=tmp_path,
        llm_mode='offline',
        cors_origins=extension_origin,
        allowed_hosts='testserver',
    )
    with TestClient(create_app(settings)) as extension_client:
        response = extension_client.post(
            '/api/boss/jobs/import',
            json={'jobs': [boss_job()]},
            headers={'Origin': extension_origin},
        )

    assert response.status_code == 200, response.text
    assert response.headers['access-control-allow-origin'] == extension_origin


def test_cors_configuration_rejects_wildcard_origin(tmp_path):
    with pytest.raises(ValueError):
        Settings(data_dir=tmp_path, llm_mode='offline', cors_origins='*')
