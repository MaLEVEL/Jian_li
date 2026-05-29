from pathlib import Path
from string import printable

from fastapi import HTTPException, UploadFile, status
from pypdf import PdfReader

SUPPORTED_EXTENSIONS = {".txt", ".pdf"}
MAX_RESUME_BYTES = 2 * 1024 * 1024
READ_CHUNK_SIZE = 64 * 1024


async def parse_resume_file(file: UploadFile) -> str:
    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .txt and .pdf files are supported",
        )

    content = await _read_limited(file)
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    if suffix == ".txt":
        text = _decode_text(content)
    else:
        text = _extract_pdf_text(content)

    text = text.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not extract text from file",
        )
    return text


async def _read_limited(file: UploadFile) -> bytes:
    chunks: list[bytes] = []
    total_size = 0
    while True:
        chunk = await file.read(READ_CHUNK_SIZE)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > MAX_RESUME_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Resume file is too large. Maximum size is 2 MB",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def _decode_text(content: bytes) -> str:
    if _looks_binary(content):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TXT resume must be readable text, not binary data",
        )

    for encoding in ("utf-8-sig", "utf-8", "gb18030", "latin-1"):
        try:
            text = content.decode(encoding)
            if _is_readable_text(text):
                return text
        except UnicodeDecodeError:
            continue
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="TXT resume content is not readable text",
    )


def _looks_binary(content: bytes) -> bool:
    if b"\x00" in content:
        return True
    sample = content[:4096]
    if not sample:
        return False
    control_bytes = sum(
        1 for byte in sample if byte < 32 and byte not in {9, 10, 13, 12}
    )
    return control_bytes / len(sample) > 0.08


def _is_readable_text(text: str) -> bool:
    sample = text[:4096]
    if not sample:
        return False
    non_printable = sum(
        1
        for char in sample
        if char not in printable and not char.isprintable() and char not in "\n\r\t"
    )
    replacement_chars = sample.count("\ufffd")
    return (non_printable + replacement_chars) / len(sample) <= 0.05


def _extract_pdf_text(content: bytes) -> str:
    try:
        from io import BytesIO

        reader = PdfReader(BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to parse PDF file",
        ) from exc
