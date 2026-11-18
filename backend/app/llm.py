import asyncio
import json
from pathlib import Path
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .config import Settings

T = TypeVar('T', bound=BaseModel)
PROMPTS = Path(__file__).parent / 'prompts'


class ModelUnavailable(RuntimeError):
    pass


class ModelClient:
    def __init__(self, settings: Settings, transport=None, retry_delay: float = 0.5):
        self.settings = settings
        self.transport = transport
        self.retry_delay = retry_delay
        self.usage = {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
        self.calls = 0

    async def complete(self, prompt_name: str, user_text: str, schema: type[T]) -> T:
        if not self.settings.online:
            raise ModelUnavailable('未启用真实模型或未配置 API Key')
        prompt = (PROMPTS / f'{prompt_name}.txt').read_text(encoding='utf-8')
        body = {'model': self.settings.model, 'temperature': 0.1, 'max_tokens': 2400,
                'response_format': {'type': 'json_object'},
                'messages': [{'role': 'system', 'content': prompt + '\nJSON Schema:\n' +
                              json.dumps(schema.model_json_schema(), ensure_ascii=False)},
                             {'role': 'user', 'content': user_text}]}
        headers = {'Authorization': 'Bearer ' + self.settings.api_key.get_secret_value()}
        async with httpx.AsyncClient(timeout=self.settings.timeout_seconds, transport=self.transport) as client:
            for attempt in range(self.settings.max_retries + 1):
                try:
                    self.calls += 1
                    response = await client.post(self.settings.base_url + 'chat/completions',
                                                 headers=headers, json=body)
                    response.raise_for_status()
                    data = response.json()
                    if not isinstance(data, dict):
                        raise ValueError('Invalid model envelope')
                    usage = data.get('usage') or {}
                    if not isinstance(usage, dict):
                        raise ValueError('Invalid usage envelope')
                    for key in ('prompt_tokens', 'completion_tokens'):
                        self.usage[key] += max(0, int(usage.get(key, 0)))
                    self.usage['total_tokens'] = self.usage['prompt_tokens'] + self.usage['completion_tokens']
                    content = data['choices'][0]['message']['content']
                    if not isinstance(content, str):
                        raise ValueError('Invalid message content')
                    content = content.strip()
                    if content.startswith('```'):
                        content = content.split('\n', 1)[1].rsplit('```', 1)[0]
                    return schema.model_validate_json(content)
                except httpx.HTTPStatusError as error:
                    retryable = error.response.status_code in (408, 429) or error.response.status_code >= 500
                    if not retryable or attempt == self.settings.max_retries:
                        raise ModelUnavailable(f'模型请求失败（HTTP {error.response.status_code}），请检查服务端配置或额度') from None
                except (httpx.RequestError, ValidationError, ValueError, KeyError, IndexError, TypeError):
                    if attempt == self.settings.max_retries:
                        raise ModelUnavailable('模型超时、连接失败或返回结构不符合要求') from None
                await asyncio.sleep(self.retry_delay * 2 ** attempt)
        raise ModelUnavailable('模型请求失败')
