import json
from collections.abc import Awaitable, Callable
from typing import Any

Scope = dict[str, Any]
Message = dict[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

MAX_FILE_BYTES = 2 * 1024 * 1024
MULTIPART_OVERHEAD_BYTES = 64 * 1024


class UploadBodyLimitMiddleware:
    """Bound an upload request before FastAPI's multipart parser spools it."""

    def __init__(
        self,
        app: ASGIApp,
        path: str = "/api/parse/resume",
        max_body_bytes: int = MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES,
    ) -> None:
        self.app = app
        self.path = path
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") != self.path:
            await self.app(scope, receive, send)
            return

        content_length = self._content_length(scope)
        if content_length is not None and content_length > self.max_body_bytes:
            await self._reject(send)
            return

        chunks = bytearray()
        disconnected: Message | None = None
        request_complete = False

        while not request_complete:
            message = await receive()
            if message["type"] == "http.request":
                chunks.extend(message.get("body", b""))
                if len(chunks) > self.max_body_bytes:
                    await self._reject(send)
                    return
                request_complete = not message.get("more_body", False)
            elif message["type"] == "http.disconnect":
                disconnected = message
                request_complete = True

        body = bytes(chunks)
        chunks.clear()

        async def replay_receive() -> Message:
            nonlocal sent_request, sent_disconnect
            if not sent_request:
                sent_request = True
                return {
                    "type": "http.request",
                    "body": body,
                    "more_body": disconnected is not None,
                }
            if disconnected is not None and not sent_disconnect:
                sent_disconnect = True
                return disconnected
            return await receive()

        sent_request = False
        sent_disconnect = False
        await self.app(scope, replay_receive, send)

    def _content_length(self, scope: Scope) -> int | None:
        values: list[int] = []
        for name, value in scope.get("headers", []):
            if name != b"content-length":
                continue
            try:
                values.append(int(value.decode("latin-1").strip()))
            except ValueError:
                return None
        if len(values) != 1 or values[0] < 0:
            return None
        return values[0]

    async def _reject(self, send: Send) -> None:
        payload = json.dumps(
            {"detail": "上传请求超过 2MB 限制。"},
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json; charset=utf-8"),
                (b"content-length", str(len(payload)).encode("latin-1")),
            ],
        })
        await send({"type": "http.response.body", "body": payload})
