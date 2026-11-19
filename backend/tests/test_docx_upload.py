import io
import zipfile
from xml.sax.saxutils import escape

import pytest
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient

NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'


def make_docx(paragraphs):
    body = ''.join(
        f'<w:p xmlns:w="{NS}"><w:r><w:t>{escape(text)}</w:t></w:r></w:p>'
        for text in paragraphs
    )
    document = f'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="{NS}"><w:body>{body}</w:body></w:document>'
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types/>')
        archive.writestr('word/document.xml', document)
    buffer.seek(0)
    return buffer.read()


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline')))


def test_docx_upload_extracts_paragraph_text(client):
    response = client.post(
        '/api/parse/resume',
        files={'file': ('resume.docx', make_docx(['王测试', 'Python / FastAPI 工程师']), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        'text': '王测试\nPython / FastAPI 工程师',
        'filename': 'resume.docx',
    }


def test_docx_upload_rejects_legacy_doc(client):
    response = client.post(
        '/api/parse/resume',
        files={'file': ('resume.doc', b'legacy binary', 'application/msword')},
    )

    assert response.status_code == 422
    assert 'docx' in response.json()['detail']


def test_docx_upload_rejects_invalid_package(client):
    response = client.post(
        '/api/parse/resume',
        files={'file': ('resume.docx', b'not a zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')},
    )

    assert response.status_code == 422
    assert response.json()['detail'] == '无法读取 Word 文件：请使用未加密的现代 .docx，或另存为 .docx 后重新上传。'


def test_docx_upload_rejects_empty_document(client):
    response = client.post(
        '/api/parse/resume',
        files={'file': ('resume.docx', make_docx(['', '  ']), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')},
    )

    assert response.status_code == 422
    assert response.json()['detail'] == '未提取到文字，或文本超过 30000 字符；请改为粘贴简历正文。'


def test_docx_upload_rejects_oversized_word_xml(client):
    content = make_docx(['A' * (4 * 1024 * 1024 + 1024)])

    assert len(content) < 2 * 1024 * 1024
    response = client.post(
        '/api/parse/resume',
        files={'file': ('large-xml.docx', content, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')},
    )

    assert response.status_code == 422
    assert response.json()['detail'] == '无法读取 Word 文件：请使用未加密的现代 .docx，或另存为 .docx 后重新上传。'


def test_docx_upload_rejects_extracted_text_over_limit(client):
    response = client.post(
        '/api/parse/resume',
        files={'file': ('long-text.docx', make_docx(['A' * 30001]), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')},
    )

    assert response.status_code == 422
    assert '30000' in response.json()['detail']
