import asyncio
import csv
import io
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pypdf import PdfReader

from .config import ROOT, Settings
from .graph import run_analysis
from .rag import MaterialRetriever
from .schemas import AnalyzeRequest, BatchRequest, MaterialInput
from .store import Store

logger = logging.getLogger('jobfit')
MAX_FILE_BYTES = 2 * 1024 * 1024


def csv_safe(value) -> str:
    text = str(value)
    return "'" + text if text.lstrip().startswith(('=', '+', '-', '@')) else text


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()
    store = Store(config.data_dir / 'jobfit.sqlite3')
    retriever = MaterialRetriever(mode=config.rag_mode, persist_directory=str(config.data_dir / 'chroma'))

    @asynccontextmanager
    async def lifespan(application):
        yield

    application = FastAPI(title='JobFit AI Agent', version='1.0.0', lifespan=lifespan)
    application.state.store = store
    application.state.settings = config
    application.add_middleware(CORSMiddleware,
        allow_origins=[value.strip() for value in config.cors_origins.split(',') if value.strip()],
        allow_methods=['GET', 'POST', 'DELETE'], allow_headers=['Content-Type'])

    @application.middleware('http')
    async def request_log(request: Request, call_next):
        begin = perf_counter()
        request_id = uuid4().hex[:12]
        response = await call_next(request)
        response.headers['X-Request-ID'] = request_id
        logger.info('request=%s method=%s status=%s duration_ms=%.1f',
                    request_id, request.method, response.status_code, (perf_counter() - begin) * 1000)
        return response

    @application.exception_handler(RequestValidationError)
    async def invalid_request(request, error):
        return JSONResponse(status_code=422, content={'detail': '输入无效：请检查必填文本、字段长度、文件格式和批量数量（1–20 条）。'})

    @application.exception_handler(Exception)
    async def unexpected_error(request, error):
        logger.error('Unhandled request failure: %s', type(error).__name__)
        return JSONResponse(status_code=500, content={'detail': '服务暂时无法完成请求，请稍后重试并检查后端配置。'})

    @application.get('/api/health')
    def health():
        return {'status': 'ok', 'mode': 'online' if config.online else 'offline',
                'model': config.model if config.online else 'offline-rules', 'rag_mode': retriever.mode}

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
    async def analyze(data: AnalyzeRequest):
        return await run_analysis(data, config, store, retriever)

    async def execute_batch(data: BatchRequest):
        semaphore = asyncio.Semaphore(config.batch_concurrency)

        async def one(index, job):
            async with semaphore:
                try:
                    report = await run_analysis(AnalyzeRequest(resume_text=data.resume_text, **job.model_dump()),
                                                config, store, retriever)
                    return report, None
                except Exception:
                    logger.warning('Batch item failed index=%d', index)
                    return None, {'index': index, 'title': job.title, 'error': '该岗位分析失败，请单独重试。'}

        pairs = await asyncio.gather(*(one(i, job) for i, job in enumerate(data.jobs)))
        results = sorted([r for r, _ in pairs if r is not None], key=lambda r: r['score'], reverse=True)
        return {'results': results, 'errors': [error for _, error in pairs if error is not None]}

    @application.post('/api/batch')
    async def batch(data: BatchRequest):
        return await execute_batch(data)

    @application.post('/api/batch/export')
    async def batch_export(data: BatchRequest):
        output = await execute_batch(data)
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
            media_type='text/csv; charset=utf-8', headers={'Content-Disposition': 'attachment; filename=jobfit-ranking.csv'})

    @application.get('/api/history')
    def history(limit: int = Query(default=100, ge=1, le=100)):
        return store.history(limit)

    @application.get('/api/history/{analysis_id}')
    def analysis(analysis_id: str):
        value = store.analysis(analysis_id)
        if not value:
            raise HTTPException(404, '分析报告不存在')
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
