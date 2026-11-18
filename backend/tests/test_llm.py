import httpx
import pytest
from app.config import Settings
from app.llm import ModelClient, ModelUnavailable
from app.schemas import JobParsed


@pytest.mark.asyncio
async def test_retries_invalid_json_and_counts_both_calls():
    count = 0

    def handler(request):
        nonlocal count
        count += 1
        content = 'not json' if count == 1 else '{"skills":[{"name":"Python"}]}'
        return httpx.Response(200, json={'choices': [{'message': {'content': content}}],
                                        'usage': {'prompt_tokens': 10, 'completion_tokens': 5}})

    settings = Settings(api_key='test-key', max_retries=1, llm_mode='online')
    client = ModelClient(settings, transport=httpx.MockTransport(handler), retry_delay=0)
    result = await client.complete('jd', 'Python', JobParsed)
    assert result.skills[0].name == 'Python'
    assert client.usage['total_tokens'] == 30
    assert count == 2


@pytest.mark.asyncio
async def test_auth_error_does_not_retry_or_leak_response():
    count = 0

    def handler(request):
        nonlocal count
        count += 1
        return httpx.Response(401, text='private-token-or-resume')

    client = ModelClient(Settings(api_key='test', max_retries=2),
                         transport=httpx.MockTransport(handler), retry_delay=0)
    with pytest.raises(ModelUnavailable) as error:
        await client.complete('jd', 'Python', JobParsed)
    assert 'private-token' not in str(error.value)
    assert count == 1
