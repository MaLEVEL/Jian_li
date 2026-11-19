import asyncio
import socket
from time import perf_counter

import httpx

from .config import Settings
from .url_safety import ResolvedProviderEndpoint, UnsafeProviderURL, resolve_provider_endpoint


class ProviderTestFailure(RuntimeError):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class PinnedProviderTransport(httpx.AsyncBaseTransport):
    def __init__(self, transport: httpx.AsyncBaseTransport, endpoint: ResolvedProviderEndpoint):
        self._transport = transport
        self._endpoint = endpoint

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        content = await request.aread()
        last_error: httpx.ConnectError | httpx.ConnectTimeout | None = None
        for address in self._endpoint.addresses:
            pinned_headers = request.headers.copy()
            pinned_headers['Host'] = self._endpoint.host_header
            pinned_request = httpx.Request(
                request.method,
                request.url.copy_with(host=address),
                headers=pinned_headers,
                content=content,
                extensions={
                    **request.extensions,
                    **(
                        {'sni_hostname': self._endpoint.sni_hostname}
                        if self._endpoint.sni_hostname
                        else {}
                    ),
                },
            )
            try:
                return await self._transport.handle_async_request(pinned_request)
            except (httpx.ConnectError, httpx.ConnectTimeout) as error:
                last_error = error
        if last_error is None:
            raise httpx.ConnectError('Provider 域名没有可用地址', request=request)
        raise last_error

    async def aclose(self) -> None:
        await self._transport.aclose()


async def probe_provider(settings: Settings, transport: httpx.AsyncBaseTransport | None = None) -> dict:
    started = perf_counter()
    try:
        endpoint = await asyncio.to_thread(resolve_provider_endpoint, settings.base_url)
    except UnsafeProviderURL:
        raise ProviderTestFailure(422, 'Provider 地址不安全：请使用不含凭据的公网 HTTPS 地址。') from None
    except socket.gaierror:
        raise ProviderTestFailure(502, '无法解析 Provider 域名，请检查服务地址和网络。') from None

    body = {
        'model': settings.model,
        'messages': [{'role': 'user', 'content': 'ping'}],
        'max_tokens': 1,
    }
    headers = {'Authorization': 'Bearer ' + settings.api_key.get_secret_value()}
    underlying_transport = transport or httpx.AsyncHTTPTransport(trust_env=False)
    pinned_transport = PinnedProviderTransport(underlying_transport, endpoint)
    try:
        async with httpx.AsyncClient(
            timeout=settings.timeout_seconds,
            transport=pinned_transport,
            follow_redirects=False,
            trust_env=False,
        ) as client:
            response = await client.post(settings.base_url + 'chat/completions', headers=headers, json=body)
            if response.is_redirect:
                raise ProviderTestFailure(
                    502,
                    '上游模型服务返回了重定向，已为安全起见拒绝跟随。',
                )
            response.raise_for_status()
            try:
                payload = response.json()
            except ValueError:
                raise ProviderTestFailure(502, '上游返回的不是 OpenAI 兼容 JSON 响应。') from None
            if not isinstance(payload, dict) or not isinstance(payload.get('choices'), list) or not payload['choices']:
                raise ProviderTestFailure(502, '上游响应不包含 OpenAI 兼容的 choices 字段。') from None
            if not isinstance(payload['choices'][0], dict):
                raise ProviderTestFailure(502, '上游 OpenAI 兼容响应结构无效。') from None
    except httpx.TimeoutException:
        raise ProviderTestFailure(504, '上游模型服务响应超时，请检查服务地址后重试。') from None
    except httpx.HTTPStatusError as error:
        if error.response.status_code in (401, 403):
            detail = '上游模型服务认证失败，请检查 API Key 和服务地址。'
        else:
            detail = '上游模型服务返回异常状态，请检查服务地址、模型名称和账户配置。'
        raise ProviderTestFailure(502, detail) from None
    except httpx.HTTPError:
        raise ProviderTestFailure(502, '无法连接上游模型服务，请检查服务地址和网络。') from None
    return {
        'ok': True,
        'model': settings.model,
        'mode': 'online',
        'latency_ms': round((perf_counter() - started) * 1000, 2),
    }
