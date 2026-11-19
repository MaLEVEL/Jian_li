from fastapi import HTTPException, Request
from pydantic import SecretStr, ValidationError

from .config import Settings
from .url_safety import UnsafeProviderURL, validate_provider_url

_API_KEY_HEADER = 'X-API-Key'
_BASE_URL_HEADER = 'X-API-Base-URL'
_MODEL_HEADER = 'X-Model'
_MAX_HEADER_LENGTHS = {
    _API_KEY_HEADER: 512,
    _BASE_URL_HEADER: 2048,
    _MODEL_HEADER: 200,
}
_INVALID_CONFIG_DETAIL = '请求级模型配置无效：请检查请求头格式和长度。'


def _validate_base_url(value: str) -> None:
    try:
        validate_provider_url(value, resolve_dns=True)
        Settings(_env_file=None, base_url=value)
    except (UnsafeProviderURL, ValidationError):
        raise HTTPException(422, _INVALID_CONFIG_DETAIL) from None


def _header_values(request: Request) -> dict[str, str]:
    values = {}
    for name, maximum in _MAX_HEADER_LENGTHS.items():
        value = request.headers.get(name, '').strip()
        if len(value) > maximum:
            raise HTTPException(422, _INVALID_CONFIG_DETAIL)
        values[name] = value
    return values


def _settings_from_headers(server: Settings, values: dict[str, str]) -> Settings:
    data = server.model_dump()
    data.update(
        api_key=SecretStr(values[_API_KEY_HEADER]),
        base_url=values[_BASE_URL_HEADER],
        model=values[_MODEL_HEADER],
        llm_mode='online',
    )
    try:
        return Settings(_env_file=None, **data)
    except ValidationError:
        raise HTTPException(422, _INVALID_CONFIG_DETAIL) from None


def request_settings(request: Request, server: Settings) -> Settings:
    """Resolve browser-owned model settings without persisting credentials.

    No headers means normal offline/server policy. A partial set is rejected so a
    browser URL or model can never borrow a different key from another source.
    Complete values live only in this request-scoped Settings object.
    """
    values = _header_values(request)
    present = [bool(value) for value in values.values()]
    if not any(present):
        return server
    if not all(present):
        raise HTTPException(422, '请求级模型配置不完整：三个请求头必须同时提供。')
    _validate_base_url(values[_BASE_URL_HEADER])
    return _settings_from_headers(server, values)


def required_request_settings(request: Request, server: Settings) -> Settings:
    """Require a complete in-memory provider configuration for explicit probes."""
    values = _header_values(request)
    if not all(values.values()):
        raise HTTPException(422, 'Provider 测试配置无效：三个请求头均为必填项。')
    _validate_base_url(values[_BASE_URL_HEADER])
    return _settings_from_headers(server, values)
