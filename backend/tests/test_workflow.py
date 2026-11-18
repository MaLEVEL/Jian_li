import pytest
from app.config import Settings
from app.graph import run_analysis
from app.llm import ModelUnavailable
from app.rag import MaterialRetriever
from app.schemas import AnalyzeRequest
from app.store import Store


@pytest.mark.asyncio
async def test_all_model_failures_are_visible_degraded_reports(tmp_path, monkeypatch):
    async def fail(*args):
        raise ModelUnavailable('模型连接失败')

    monkeypatch.setattr('app.graph.ModelClient.complete', fail)
    report = await run_analysis(AnalyzeRequest(resume_text='Python', jd_text='必须 Python'),
        Settings(api_key='test', data_dir=tmp_path), Store(tmp_path / 'test.sqlite3'), MaterialRetriever())
    assert report['mode'] == 'degraded'
    assert report['score'] == 100
    assert report['trace'][1]['status'] == 'degraded'
    assert any('所有模型步骤' in warning for warning in report['warnings'])


@pytest.mark.asyncio
async def test_batch_partial_failure_keeps_successful_jobs(tmp_path, monkeypatch):
    from app.graph import run_analysis as real_run
    from app.main import create_app
    from fastapi.testclient import TestClient

    async def sometimes_fail(request, *args):
        if request.title == '失败岗位':
            raise RuntimeError('secret-in-upstream-error')
        return await real_run(request, *args)

    monkeypatch.setattr('app.main.run_analysis', sometimes_fail)
    with TestClient(create_app(Settings(data_dir=tmp_path, llm_mode='offline'))) as client:
        result = client.post('/api/batch', json={'resume_text': 'Python', 'jobs': [
            {'title': '正常岗位', 'jd_text': 'Python'}, {'title': '失败岗位', 'jd_text': 'Python'}]})
    assert result.status_code == 200
    assert len(result.json()['results']) == 1
    assert result.json()['errors'][0]['index'] == 1
    assert 'secret-in-upstream-error' not in result.text


@pytest.mark.asyncio
async def test_unavailable_bge_does_not_pretend_retrieval_succeeded(tmp_path):
    class BrokenRetriever:
        mode = 'chroma-bge-rerank'

        def search(self, *args):
            raise RuntimeError('model not downloaded')

    report = await run_analysis(AnalyzeRequest(resume_text='Python', jd_text='Docker'),
        Settings(data_dir=tmp_path, llm_mode='offline'), Store(tmp_path / 'test.sqlite3'), BrokenRetriever())
    assert report['evidence'] == []
    assert report['rag_mode'] == 'unavailable'
    assert report['trace'][4]['status'] == 'degraded'
