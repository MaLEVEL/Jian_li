from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / '.env', extra='ignore', env_prefix='JOBFIT_')

    api_key: SecretStr = SecretStr('')
    base_url: str = 'https://open.bigmodel.cn/api/paas/v4/'
    model: str = 'glm-4-flash'
    llm_mode: Literal['auto', 'offline', 'online'] = 'auto'
    timeout_seconds: float = Field(default=30, ge=1, le=120)
    max_retries: int = Field(default=2, ge=0, le=3)
    data_dir: Path = ROOT / 'data'
    rag_mode: Literal['local', 'bge'] = 'local'
    batch_concurrency: int = Field(default=2, ge=1, le=4)
    cors_origins: str = 'http://localhost:5173,http://127.0.0.1:5173'

    @field_validator('base_url')
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        from urllib.parse import urlparse
        parsed = urlparse(value)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username:
            raise ValueError('Base URL 必须为不含凭据的 HTTP(S) 地址')
        if parsed.query or parsed.fragment:
            raise ValueError('Base URL 不应包含查询参数或片段')
        return value.rstrip('/') + '/'

    @property
    def online(self) -> bool:
        return self.llm_mode != 'offline' and bool(self.api_key.get_secret_value())
