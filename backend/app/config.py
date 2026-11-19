import re
from ipaddress import ip_address
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, PrivateAttr, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .url_safety import validate_provider_url

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXTENSION_ORIGIN = 'chrome-extension://jdacbgmhcbpkoccblehfahhoekjiiopl'


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / '.env', extra='ignore', env_prefix='YUNFAN_')

    base_url: str = 'https://open.bigmodel.cn/api/paas/v4/'
    model: str = 'glm-4-flash'
    llm_mode: Literal['auto', 'offline', 'online'] = 'auto'
    timeout_seconds: float = Field(default=60, ge=1, le=120)
    max_retries: int = Field(default=2, ge=0, le=3)
    reasoning_effort: Literal['', 'low', 'high', 'max'] = ''
    data_dir: Path = ROOT / 'data'
    rag_mode: Literal['local', 'bge'] = 'local'
    batch_concurrency: int = Field(default=2, ge=1, le=4)
    cors_origins: str = (
        'http://localhost:5173,http://127.0.0.1:5173,' + DEFAULT_EXTENSION_ORIGIN
    )
    allowed_hosts: str = '127.0.0.1,localhost,::1'
    _request_api_key: SecretStr = PrivateAttr(default=SecretStr(''))

    def __init__(self, api_key: str | SecretStr | None = None, **data):
        """Accept an in-memory request key without creating a settings environment field.

        `YUNFAN_API_KEY` is intentionally ignored: model credentials are stored by the
        browser and arrive in request headers. Keeping the key as a private attribute
        prevents it from appearing in model dumps, settings files, or container config.
        """
        super().__init__(**data)
        if api_key is not None:
            raw = api_key.get_secret_value() if isinstance(api_key, SecretStr) else str(api_key)
            self._request_api_key = SecretStr(raw)

    @property
    def api_key(self) -> SecretStr:
        return self._request_api_key

    @property
    def online(self) -> bool:
        return self.llm_mode != 'offline' and bool(self.api_key.get_secret_value())

    @field_validator('cors_origins')
    @classmethod
    def validate_cors_origins(cls, value: str) -> str:
        origins = [item.strip().rstrip('/') for item in value.split(',') if item.strip()]
        for origin in origins:
            if origin == '*':
                raise ValueError('CORS 不允许通配来源')
            parsed = urlsplit(origin)
            if parsed.query or parsed.fragment:
                raise ValueError('CORS 来源不能包含查询参数或片段')
            if parsed.scheme in ('http', 'https'):
                if not parsed.hostname or parsed.username is not None or parsed.password is not None:
                    raise ValueError('CORS 来源必须是无凭据的完整 HTTP(S) origin')
                if parsed.path:
                    raise ValueError('CORS 来源只能包含 scheme、host 和可选端口')
            elif parsed.scheme == 'chrome-extension':
                if not re.fullmatch(r'[a-p]{32}', parsed.netloc) or parsed.path:
                    raise ValueError('CORS 扩展来源必须是完整的 chrome-extension://<32 位扩展 ID>')
            else:
                raise ValueError('CORS 来源只支持 HTTP(S) 或精确的 Chrome 扩展 ID')
        return ','.join(origins)

    @property
    def cors_origin_list(self) -> list[str]:
        return [item for item in self.cors_origins.split(',') if item]

    @field_validator('allowed_hosts')
    @classmethod
    def validate_allowed_hosts(cls, value: str) -> str:
        hosts = [item.strip().casefold().rstrip('.') for item in value.split(',') if item.strip()]
        if not hosts:
            raise ValueError('至少需要一个允许访问的 Host')
        for host in hosts:
            if host == '*' or '/' in host or '://' in host:
                raise ValueError('Host 白名单必须是明确的主机名或 IP，不允许通配符和 URL')
            candidate = host[1:-1] if host.startswith('[') and host.endswith(']') else host
            try:
                ip_address(candidate)
                continue
            except ValueError:
                pass
            if ':' in candidate or not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', candidate):
                raise ValueError('Host 白名单包含无效主机名')
        return ','.join(hosts)

    @property
    def allowed_host_list(self) -> list[str]:
        return [item for item in self.allowed_hosts.split(',') if item]

    @field_validator('base_url')
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        validate_provider_url(value)
        return value.rstrip('/') + '/'