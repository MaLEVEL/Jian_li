import httpx
import pytest
from app.config import Settings
from app.main import create_app

MAX_FILE_BYTES = 2 * 1024 * 1024
MULTIPART_OVERHEAD_BYTES = 64 * 1024
REQUEST_LIMIT = MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES


def make_app(tmp_path):
    return create_app(Settings(data_dir=tmp_path, llm_mode="offline"))


def oversize_multipart_with_allowed_file() -> bytes:
    boundary = "jobfit-upload-test"
    padding = b"x" * (MULTIPART_OVERHEAD_BYTES + 1)
    file_bytes = b"a" * MAX_FILE_BYTES
    return (
        f"--{boundary}\r\n"
        "Content-Disposition: form-data; name=\"padding\"\r\n\r\n"
        .encode()
        + padding
        + f"\r\n--{boundary}\r\n"
        "Content-Disposition: form-data; name=\"file\"; filename=\"resume.txt\"\r\n"
        "Content-Type: text/plain\r\n\r\n"
        .encode()
        + file_bytes
        + f"\r\n--{boundary}--\r\n"
        .encode()
    )


class SingleChunkStream(httpx.AsyncByteStream):
    def __init__(self, body: bytes):
        self.body = body

    async def __aiter__(self):
        yield self.body


@pytest.mark.asyncio
async def test_chunked_oversized_multipart_is_rejected_without_content_length(tmp_path):
    body = oversize_multipart_with_allowed_file()
    assert len(body) > REQUEST_LIMIT

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=make_app(tmp_path)),
        base_url="http://testserver",
    ) as client:
        request = httpx.Request(
            "POST",
            "http://testserver/api/parse/resume",
            stream=SingleChunkStream(body),
            headers={"Content-Type": "multipart/form-data; boundary=jobfit-upload-test"},
        )
        request.headers.pop("content-length", None)
        response = await client.send(request)

    assert response.status_code == 413
    assert response.json() == {"detail": "上传请求超过 2MB 限制。"}


@pytest.mark.asyncio
async def test_declared_oversized_request_is_rejected_before_downstream_reads(tmp_path):
    app = make_app(tmp_path)
    receive_calls = 0

    async def counting_app(scope, receive, send):
        nonlocal receive_calls

        async def counting_receive():
            nonlocal receive_calls
            receive_calls += 1
            return await receive()

        await app(scope, counting_receive, send)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=counting_app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "http://testserver/api/parse/resume",
            files={"file": ("resume.txt", b"a" * (REQUEST_LIMIT + 1), "text/plain")},
        )

    assert response.status_code == 413
    assert response.json() == {"detail": "上传请求超过 2MB 限制。"}
    assert receive_calls == 0


@pytest.mark.asyncio
async def test_upload_below_request_limit_reaches_resume_parser(tmp_path):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=make_app(tmp_path)),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "http://testserver/api/parse/resume",
            files={"file": ("resume.txt", "简历 Python".encode(), "text/plain")},
        )

    assert response.status_code == 200
    assert response.json() == {"text": "简历 Python", "filename": "resume.txt"}
