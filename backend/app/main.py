import asyncio
import csv
import io
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from time import perf_counter
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pypdf import PdfReader

from .business_skills import get_skill, list_skills, run_skill
from .config import ROOT, Settings
from .graph import run_analysis
from .provider_probe import ProviderTestFailure, probe_provider
from .rag import MaterialRetriever
from .request_settings import request_settings, required_request_settings
from .schemas import (
    AnalyzeRequest,
    BatchRequest,
    BossJobBatchInput,
    BossJobImportResult,
    BossJobRecord,
    MaterialInput,
    SkillRunRequest,
    WorkspaceEnvelope,
    WorkspacePutRequest,
)
from .store import Store
from .upload_limit import UploadBodyLimitMiddleware

logger = logging.getLogger('jobfit')
MAX_FILE_BYTES = 2 * 1024 * 1024


def csv_safe(value) -> str:
    text = str(value)
    return "'" + text if text.lstrip().startswith(('=', '+', '-', '@')) else text


def normalized_request_host(value: str) -> str:
    try:
        parsed = urlsplit('//' + value.strip())
        if parsed.username is not None or parsed.password is not None or parsed.path not in ('', '/'):
            return ''
        return (parsed.hostname or '').casefold().rstrip('.')
    except ValueError:
        return ''


def create_app(
    settings: Settings | None = None,
    provider_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    config = settings or Settings()
    store = Store(config.data_dir / 'jobfit.sqlite3')
    retriever = MaterialRetriever(mode=config.rag_mode, persist_directory=str(config.data_dir / 'chroma'))

    @asynccontextmanager
    async def lifespan(application):
        yield

    application = FastAPI(title='职启云帆 · 求职成长工作台 API', version='1.0.0', lifespan=lifespan)
    application.state.store = store
    application.state.settings = config
    application.state.provider_transport = provider_transport
    application.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origin_list,
        allow_methods=['GET', 'POST', 'PUT', 'DELETE'],
        allow_headers=['Content-Type', 'X-API-Key', 'X-API-Base-URL', 'X-Model'],
        expose_headers=['X-Total-Count', 'X-Limit', 'X-Offset', 'X-Request-ID'],
    )
    application.add_middleware(UploadBodyLimitMiddleware)

    @application.middleware('http')
    async def request_log(request: Request, call_next):
        begin = perf_counter()
        request_id = uuid4().hex[:12]
        host = request.headers.get('host', '')
        hostname = normalized_request_host(host)
        if hostname not in config.allowed_host_list:
            response = JSONResponse(
                status_code=400,
                content={'detail': '请求 Host 不在允许列表中。请配置 YUNFAN_ALLOWED_HOSTS。'},
            )
        else:
            origin = request.headers.get('origin')
            state_changing = request.method in {'POST', 'PUT', 'PATCH', 'DELETE'}
            same_origin = False
            if origin:
                try:
                    parsed_origin = urlsplit(origin)
                    same_origin = (
                        parsed_origin.scheme == request.url.scheme
                        and request.url.scheme in {'http', 'https'}
                        and (parsed_origin.hostname or '').casefold().rstrip('.') == hostname
                        and parsed_origin.port == request.url.port
                    )
                except ValueError:
                    same_origin = False
            if state_changing and origin and not same_origin and origin not in config.cors_origin_list:
                # The trusted Host allowlist blocks DNS rebinding before Origin checks.
                # Mutations additionally require an exact origin or the trusted same origin.
                response = JSONResponse(
                    status_code=403,
                    content={'detail': '请求来源不在允许列表中。'},
                )
            else:
                response = await call_next(request)
        response.headers['X-Request-ID'] = request_id
        logger.info('request=%s method=%s status=%s duration_ms=%.1f',
                    request_id, request.method, response.status_code, (perf_counter() - begin) * 1000)
        return response

    @application.exception_handler(RequestValidationError)
    async def invalid_request(request, error):
        return JSONResponse(status_code=422, content={'detail': '输入无效：请检查必填字段、文本长度、URL、文件格式和批量数量限制。'})

    @application.exception_handler(Exception)
    async def unexpected_error(request, error):
        logger.error('Unhandled request failure: %s', type(error).__name__)
        return JSONResponse(status_code=500, content={'detail': '服务暂时无法完成请求，请稍后重试并检查后端配置。'})

    @application.get('/api/health')
    def health():
        return {'status': 'ok', 'mode': 'online' if config.online else 'offline',
                'model': config.model if config.online else 'offline-rules', 'rag_mode': retriever.mode}

    @application.get('/api/workspace', response_model=WorkspaceEnvelope)
    def workspace():
        value = store.workspace_state()
        if value is None:
            raise HTTPException(404, '工作区快照不存在')
        return value

    @application.put('/api/workspace', response_model=WorkspaceEnvelope)
    def save_workspace(data: WorkspacePutRequest):
        saved, current = store.save_workspace_state(
            data.state.model_dump(mode='json'),
            data.expected_revision,
        )
        if not saved:
            if current is None:
                raise HTTPException(409, '工作区版本冲突，请重新加载。')
            return JSONResponse(
                status_code=409,
                content={'detail': '服务器工作区已被更新。', 'current': current},
            )
        return current

    @application.post('/api/provider/test')
    async def provider_test(request: Request):
        settings = required_request_settings(request, config)
        try:
            return await probe_provider(settings, application.state.provider_transport)
        except ProviderTestFailure as error:
            raise HTTPException(error.status_code, error.detail) from None

    @application.post(
        '/api/boss/jobs/import',
        response_model=BossJobImportResult,
        response_model_exclude_none=True,
    )
    def import_boss_jobs(data: BossJobBatchInput):
        return store.upsert_boss_jobs([job.model_dump(mode='json') for job in data.jobs])

    @application.get('/api/boss/jobs', response_model=list[BossJobRecord])
    def boss_jobs(
        response: Response,
        limit: int = Query(default=50, ge=1, le=200),
        offset: int = Query(default=0, ge=0, le=1_000_000),
    ):
        total = store.boss_job_count()
        response.headers['X-Total-Count'] = str(total)
        response.headers['X-Limit'] = str(limit)
        response.headers['X-Offset'] = str(offset)
        return store.boss_jobs(limit=limit, offset=offset)

    @application.get('/api/boss/jobs/{job_id}', response_model=BossJobRecord)
    def boss_job(job_id: str):
        value = store.boss_job(job_id)
        if not value:
            raise HTTPException(404, 'BOSS 职位不存在')
        return value

    @application.delete('/api/boss/jobs/{job_id}', status_code=204)
    def delete_boss_job(job_id: str):
        if not store.delete_boss_job(job_id):
            raise HTTPException(404, 'BOSS 职位不存在')
        return Response(status_code=204)

    @application.get('/api/boss/health')
    def boss_health():
        return {
            'status': 'ok',
            'source': 'boss',
            'count': store.boss_job_count(),
            'capabilities': ['import', 'list', 'get', 'delete'],
        }

    @application.get('/api/materials')
    def materials():
        return store.materials()

    @application.post('/api/materials', status_code=201)
    def add_material(data: MaterialInput):
        return store.add_material(data.model_dump())

    @application.delete('/api/materials/{material_id}', status_code=204)
    def delete_material(material_id: str):
        if not store.delete_material(material_id):
            raise HTTPException(404, '素材不存在')
        return Response(status_code=204)

    @application.post('/api/analyze')
    async def analyze(data: AnalyzeRequest, request: Request):
        return await run_analysis(data, request_settings(request, config), store, retriever)

    async def execute_batch(data: BatchRequest, settings: Settings):
        semaphore = asyncio.Semaphore(settings.batch_concurrency)

        async def one(index, job):
            async with semaphore:
                try:
                    report = await run_analysis(
                        AnalyzeRequest(resume_text=data.resume_text, **job.model_dump()),
                        settings,
                        store,
                        retriever,
                    )
                    return report, None
                except Exception:
                    logger.warning('Batch item failed index=%d', index)
                    return None, {'index': index, 'title': job.title, 'error': '该岗位分析失败，请单独重试。'}

        pairs = await asyncio.gather(*(one(i, job) for i, job in enumerate(data.jobs)))
        results = sorted([r for r, _ in pairs if r is not None], key=lambda r: r['score'], reverse=True)
        return {'results': results, 'errors': [error for _, error in pairs if error is not None]}

    @application.post('/api/batch')
    async def batch(data: BatchRequest, request: Request):
        return await execute_batch(data, request_settings(request, config))

    @application.post('/api/batch/export')
    async def batch_export(data: BatchRequest, request: Request):
        output = await execute_batch(data, request_settings(request, config))
        buffer = io.StringIO(newline='')
        writer = csv.writer(buffer)
        writer.writerow(['公司', '岗位', '匹配分', '缺失技能', '模式', '报告ID', '错误'])
        for report in output['results']:
            writer.writerow([csv_safe(report['company']), csv_safe(report['title']), report['score'],
                             csv_safe(' / '.join(report['missing_skills'])), report['mode'], report['id'], ''])
        for error in output['errors']:
            job = data.jobs[error['index']]
            writer.writerow([csv_safe(job.company), csv_safe(job.title), '', '', '', '', error['error']])
        return Response(content=('\ufeff' + buffer.getvalue()).encode('utf-8'),
            media_type='text/csv; charset=utf-8', headers={'Content-Disposition': 'attachment; filename=zhiqi-yunfan-ranking.csv'})

    @application.get('/api/history')
    def history(limit: int = Query(default=100, ge=1, le=100)):
        return store.history(limit)

    @application.get('/api/history/{analysis_id}')
    def analysis(analysis_id: str):
        value = store.analysis(analysis_id)
        if not value:
            raise HTTPException(404, '分析报告不存在')
        return value

    @application.get('/api/skills')
    def skills():
        return [skill.model_dump() for skill in list_skills()]

    @application.post('/api/skills/{skill_id}/run')
    async def run_business_skill(skill_id: str, data: SkillRunRequest, request: Request):
        try:
            package = get_skill(skill_id)
        except KeyError:
            raise HTTPException(404, '业务技能不存在') from None
        analysis = store.analysis(data.analysis_id)
        if not analysis:
            raise HTTPException(404, '分析报告不存在')
        return await run_skill(package, analysis, request_settings(request, config), store)

    @application.get('/api/skill-runs')
    def skill_runs(analysis_id: str = Query(min_length=1, max_length=64)):
        return store.skill_runs(analysis_id)

    @application.get('/api/skill-runs/{run_id}')
    def skill_run(run_id: str):
        value = store.skill_run(run_id)
        if not value:
            raise HTTPException(404, '技能运行记录不存在')
        return value
    @application.post('/api/parse/resume')
    async def parse_resume(file: UploadFile = File(...)):
        filename = Path(file.filename or '').name
        suffix = Path(filename).suffix.lower()
        if suffix not in ('.txt', '.pdf'):
            raise HTTPException(422, '只支持 UTF-8 TXT 或包含文字的 PDF')
        content = await file.read(MAX_FILE_BYTES + 1)
        await file.close()
        if len(content) > MAX_FILE_BYTES:
            raise HTTPException(413, '文件不能超过 2MB')
        try:
            if suffix == '.pdf':
                if not content.startswith(b'%PDF-'):
                    raise ValueError('Invalid PDF header')
                reader = PdfReader(io.BytesIO(content))
                if reader.is_encrypted or len(reader.pages) > 20:
                    raise ValueError('Encrypted or too many pages')
                text = await asyncio.to_thread(lambda: '\n'.join(page.extract_text() or '' for page in reader.pages))
            else:
                text = content.decode('utf-8-sig')
            if any(ord(c) < 32 and c not in '\n\r\t' for c in text):
                raise ValueError('Binary text')
        except Exception:
            raise HTTPException(422, '无法读取文件：请使用 UTF-8 TXT 或未加密、最多 20 页的文字 PDF；扫描件需要先 OCR。') from None
        if not text.strip() or len(text) > 30000:
            raise HTTPException(422, '未提取到文字，或文本超过 30000 字符；请改为粘贴简历正文。')
        return {'text': text.strip(), 'filename': filename}

    frontend = ROOT / 'frontend' / 'dist'
    if frontend.is_dir():
        @application.get('/{path:path}', include_in_schema=False)
        def frontend_files(path: str):
            if path == 'api' or path.startswith('api/'):
                raise HTTPException(404, '接口不存在')
            target = (frontend / path).resolve()
            if not target.is_relative_to(frontend.resolve()):
                raise HTTPException(404)
            return FileResponse(target if target.is_file() else frontend / 'index.html')

    return application


app = create_app()
