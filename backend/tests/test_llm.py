import json

import httpx
import pytest
from app.config import Settings
from app.llm import ModelClient, ModelUnavailable
from app.schemas import JobParsed
from app.url_safety import ResolvedProviderEndpoint


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


@pytest.mark.asyncio
@pytest.mark.parametrize('body', [[], {'usage': 'invalid'},
    {'choices': [{'message': {'content': None}}]},
    {'choices': [{'message': {'content': '{}'}}], 'usage': ['invalid']}])
async def test_malformed_response_shapes_become_safe_model_errors(body):
    client = ModelClient(Settings(api_key='test', max_retries=0),
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=body)), retry_delay=0)
    with pytest.raises(ModelUnavailable):
        await client.complete('jd', 'Python', JobParsed)

@pytest.mark.asyncio
async def test_optional_max_tokens_is_sent_and_counts_actual_usage():
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={
            'choices': [{'message': {'content': '{"skills":[{"name":"Python"}]}'}}],
            'usage': {'prompt_tokens': 7, 'completion_tokens': 3},
        })

    client = ModelClient(Settings(api_key='test', llm_mode='online'),
                         transport=httpx.MockTransport(handler), retry_delay=0)
    await client.complete('jd', 'Python', JobParsed, max_tokens=1200)
    assert requests[0]['max_tokens'] == 1200
    assert client.usage == {'prompt_tokens': 7, 'completion_tokens': 3, 'total_tokens': 10}


@pytest.mark.asyncio
async def test_finish_reason_length_fails_once_with_clear_error_and_counts_usage():
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={
            'choices': [{'finish_reason': 'length', 'message': {'content': '{"skills":'}}],
            'usage': {'prompt_tokens': 1254, 'completion_tokens': 2400},
        })

    client = ModelClient(Settings(api_key='test', llm_mode='online', max_retries=2),
                         transport=httpx.MockTransport(handler), retry_delay=0)
    with pytest.raises(ModelUnavailable) as error:
        await client.complete('business_skill', 'long input', JobParsed, max_tokens=2400)
    message = str(error.value)
    assert 'max_tokens' in message and '2400' in message and 'JSON' in message
    assert '2400' in message
    assert len(requests) == 1
    assert client.usage == {'prompt_tokens': 1254, 'completion_tokens': 2400, 'total_tokens': 3654}

@pytest.mark.asyncio
@pytest.mark.parametrize('reasoning_effort,expected_value', [('', None), ('low', 'low')])
async def test_reasoning_effort_is_omitted_by_default_and_sent_only_when_configured(
    reasoning_effort, expected_value
):
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={
            'choices': [{'message': {'content': '{"skills":[{"name":"Python"}]}'}}],
            'usage': {'prompt_tokens': 3, 'completion_tokens': 2},
        })

    settings = Settings(
        _env_file=None,
        api_key='test',
        llm_mode='online',
        reasoning_effort=reasoning_effort,
    )
    client = ModelClient(settings, transport=httpx.MockTransport(handler), retry_delay=0)
    await client.complete('jd', 'Python', JobParsed)

    assert requests[0].get('reasoning_effort', None) == expected_value
    assert 'thinking' not in requests[0]

@pytest.mark.asyncio
@pytest.mark.parametrize('choice', [None, [], 'invalid', 5])
async def test_malformed_choice_shapes_degrade_once_and_keep_usage(choice):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={
            'choices': [choice],
            'usage': {'prompt_tokens': 11, 'completion_tokens': 7},
        })

    client = ModelClient(Settings(api_key='test', llm_mode='online', max_retries=0),
                         transport=httpx.MockTransport(handler), retry_delay=0)
    with pytest.raises(ModelUnavailable):
        await client.complete('jd', 'Python', JobParsed)
    assert len(requests) == 1
    assert client.usage == {'prompt_tokens': 11, 'completion_tokens': 7, 'total_tokens': 18}


@pytest.mark.asyncio
async def test_model_client_pins_requests_to_the_validated_ip(monkeypatch):
    captured = []
    endpoint = ResolvedProviderEndpoint(
        scheme='https',
        hostname='provider.example',
        port=443,
        addresses=('93.184.216.34',),
        host_header='provider.example',
        sni_hostname='provider.example',
    )
    monkeypatch.setattr('app.llm.resolve_provider_endpoint', lambda _value: endpoint)

    def fake_transport(*, trust_env):
        assert trust_env is False

        def handler(request):
            captured.append(request)
            return httpx.Response(200, json={
                'choices': [{'message': {'content': '{"skills":[{"name":"Python"}]}'}}],
                'usage': {'prompt_tokens': 2, 'completion_tokens': 1},
            })

        return httpx.MockTransport(handler)

    monkeypatch.setattr('app.llm.httpx.AsyncHTTPTransport', fake_transport)
    client = ModelClient(Settings(
        _env_file=None,
        api_key='pinned-secret',
        base_url='https://provider.example/v1/',
        llm_mode='online',
        max_retries=0,
    ), transport=None, retry_delay=0)

    await client.complete('jd', 'Python', JobParsed)

    assert len(captured) == 1
    assert captured[0].url.host == '93.184.216.34'
    assert captured[0].headers['host'] == 'provider.example'
    assert captured[0].extensions['sni_hostname'] == 'provider.example'
