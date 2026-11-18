import pytest
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path, llm_mode='offline'))) as value:
        yield value


def payload(**changes):
    return {'resume_text': '项目：使用 Python 和 FastAPI 开发接口，pytest 回归测试。',
            'jd_text': '必须掌握 Python、FastAPI；Docker 加分。',
            'company': '测试公司', 'title': 'Python 工程师', **changes}


def test_material_analysis_history_and_delete(client):
    material = client.post('/api/materials', json={'title': '真实容器经历',
        'content': '使用 Docker 打包课程项目，并编写镜像构建文档。', 'tags': ['Docker']}).json()
    response = client.post('/api/analyze', json=payload())
    assert response.status_code == 200, response.text
    report = response.json()
    assert report['score'] == 85.7
    assert report['mode'] == 'offline'
    assert report['missing_skills'] == ['Docker']
    assert report['evidence'][0]['id'] == material['id']
    assert report['advice'][0]['evidence_ids'] == [material['id']]
    assert [step['node'] for step in report['trace']] == [
        'route', 'parse_jd', 'parse_resume', 'match', 'retrieve', 'advise']
    assert client.get('/api/history').json()[0]['id'] == report['id']
    assert client.get('/api/history/' + report['id']).json()['score'] == report['score']
    assert client.delete('/api/materials/' + material['id']).status_code == 204
    assert client.get('/api/materials').json() == []


def test_batch_sorted_and_csv_is_formula_safe(client):
    data = {'resume_text': 'Python FastAPI', 'jobs': [
        {'title': '=SUM(A1)', 'company': '+cmd', 'jd_text': '必须 Docker'},
        {'title': 'Python', 'company': '正常', 'jd_text': '必须 Python'}]}
    response = client.post('/api/batch', json=data)
    assert response.status_code == 200
    assert [r['score'] for r in response.json()['results']] == [100, 0]
    exported = client.post('/api/batch/export', json=data)
    assert exported.status_code == 200
    assert "'=SUM(A1)" in exported.text
    assert "'+cmd" in exported.text


def test_rejects_blank_input_and_oversize_batch(client):
    assert client.post('/api/analyze', json=payload(jd_text='  ')).status_code == 422
    assert client.post('/api/batch', json={'resume_text': 'Python', 'jobs':
        [{'jd_text': 'Python'}] * 21}).status_code == 422


def test_upload_rejects_binary_and_accepts_utf8(client):
    assert client.post('/api/parse/resume', files={
        'file': ('resume.txt', b'\x00binary', 'text/plain')}).status_code == 422
    result = client.post('/api/parse/resume', files={
        'file': ('resume.txt', '简历 Python'.encode(), 'text/plain')})
    assert result.json()['text'] == '简历 Python'
    assert client.post('/api/parse/resume', files={
        'file': ('resume.txt', b'a' * (2 * 1024 * 1024 + 1), 'text/plain')}).status_code == 413


def test_missing_records_return_404(client):
    assert client.get('/api/history/missing').status_code == 404
    assert client.delete('/api/materials/missing').status_code == 404
