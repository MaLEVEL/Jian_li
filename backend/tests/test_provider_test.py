import json
import socket

import httpx
import pytest
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient

HEADERS = {
    'X-API-Key': 'provider-secret-key',
    'X-API-Base-URL': 'https://provider.example/v1',
    'X-Model': 'provider-model',
}


PUBLIC_TEST_IP = '93.184.216.34'


@pytest.fixture
def public_dns(monkeypatch):
    def resolve(host, port, *, type):
        return [(
            socket.AF_INET,
            socket.SOCK_STREAM,
            socket.IPPROTO_TCP,
            '',
            (PUBLIC_TEST_IP, port),
        )]

    monkeypatch.setattr('app.url_safety.socket.getaddrinfo', resolve)


def assert_secret_absent(secret, response, tmp_path):
    assert secret not in response.text
    database = tmp_path / 'jobfit.sqlite3'
    if database.exists():
        assert secret.encode() not in database.read_bytes()


def test_provider_test_success_uses_override_headers_and_mock_transport(tmp_path, public_dns):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={'choices': [{'message': {'content': 'pong'}}]})

    settings = Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline')
    with TestClient(create_app(settings, provider_transport=httpx.MockTransport(handler))) as client:
        response = client.post('/api/provider/test', headers=HEADERS)

    assert response.status_code == 200, response.text
    result = response.json()
    assert result['ok'] is True
    assert result['model'] == HEADERS['X-Model']
    assert result['mode'] == 'online'
    assert result['latency_ms'] >= 0
    assert len(requests) == 1
    upstream = requests[0]
    assert upstream.method == 'POST'
    assert str(upstream.url) == 'https://93.184.216.34/v1/chat/completions'
    assert upstream.headers['Authorization'] == 'Bearer ' + HEADERS['X-API-Key']
    assert json.loads(upstream.content) == {
        'model': HEADERS['X-Model'],
        'messages': [{'role': 'user', 'content': 'ping'}],
        'max_tokens': 1,
    }
    assert_secret_absent(HEADERS['X-API-Key'], response, tmp_path)


@pytest.mark.parametrize('headers', [
    {},
    {'X-API-Base-URL': HEADERS['X-API-Base-URL'], 'X-Model': HEADERS['X-Model']},
    {**HEADERS, 'X-API-Key': ''},
    {**HEADERS, 'X-API-Base-URL': ' '},
    {**HEADERS, 'X-Model': ''},
])
def test_provider_test_requires_all_three_non_empty_headers(tmp_path, headers):
    called = False

    def handler(request):
        nonlocal called
        called = True
        return httpx.Response(200, json={'choices': [{'message': {'content': 'pong'}}]})

    with TestClient(create_app(
        Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline'),
        provider_transport=httpx.MockTransport(handler),
    )) as client:
        response = client.post('/api/provider/test', headers=headers)

    assert response.status_code == 422
    assert called is False
    assert response.json()['detail'] == 'Provider 测试配置无效：三个请求头均为必填项。'


def test_provider_test_maps_upstream_401_to_safe_bad_gateway(tmp_path, public_dns):
    secret = HEADERS['X-API-Key']

    def handler(request):
        return httpx.Response(401, text='upstream echoed ' + secret)

    with TestClient(create_app(
        Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline'),
        provider_transport=httpx.MockTransport(handler),
    )) as client:
        response = client.post('/api/provider/test', headers=HEADERS)

    assert response.status_code == 502
    assert response.json() == {'detail': '上游模型服务认证失败，请检查 API Key 和服务地址。'}
    assert_secret_absent(secret, response, tmp_path)


def test_provider_test_maps_timeout_to_gateway_timeout_without_leaking_key(tmp_path, public_dns):
    secret = HEADERS['X-API-Key']

    def handler(request):
        raise httpx.ReadTimeout('timed out for ' + secret, request=request)

    with TestClient(create_app(
        Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline', timeout_seconds=1),
        provider_transport=httpx.MockTransport(handler),
    )) as client:
        response = client.post('/api/provider/test', headers=HEADERS)

    assert response.status_code == 504
    assert response.json() == {'detail': '上游模型服务响应超时，请检查服务地址后重试。'}
    assert_secret_absent(secret, response, tmp_path)


@pytest.mark.parametrize('base_url', [
    'javascript:alert(1)',
    'ftp://provider.example/v1/',
    'https://user:password@provider.example/v1/',
    'http://provider.example/v1/',
    'https://169.254.169.254/latest/meta-data/',
    'https://10.0.0.8/v1/',
    'https://192.168.1.10/v1/',
    'https://240.0.0.1/v1/',
])
def test_provider_test_rejects_malicious_base_url_before_transport(tmp_path, base_url):
    called = False

    def handler(request):
        nonlocal called
        called = True
        return httpx.Response(200, json={'choices': [{'message': {'content': 'pong'}}]})

    headers = {**HEADERS, 'X-API-Base-URL': base_url}
    with TestClient(create_app(
        Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline'),
        provider_transport=httpx.MockTransport(handler),
    )) as client:
        response = client.post('/api/provider/test', headers=headers)

    assert response.status_code == 422
    assert called is False
    assert HEADERS['X-API-Key'] not in response.text
    assert_secret_absent(HEADERS['X-API-Key'], response, tmp_path)


def test_provider_test_allows_loopback_http_with_mock_transport(tmp_path):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={'choices': [{'message': {'content': 'pong'}}]})

    headers = {**HEADERS, 'X-API-Base-URL': 'http://127.0.0.1:8080/v1'}
    with TestClient(create_app(
        Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline'),
        provider_transport=httpx.MockTransport(handler),
    )) as client:
        response = client.post('/api/provider/test', headers=headers)

    assert response.status_code == 200, response.text
    assert str(requests[0].url) == 'http://127.0.0.1:8080/v1/chat/completions'
    assert_secret_absent(HEADERS['X-API-Key'], response, tmp_path)


def test_provider_test_rejects_hostname_resolving_to_private_address(tmp_path, monkeypatch):
    called = False

    def handler(request):
        nonlocal called
        called = True
        return httpx.Response(200, json={'choices': [{'message': {'content': 'pong'}}]})

    def private_dns(host, port, *, type):
        assert host == 'private.provider.example'
        assert port == 443
        return [(
            socket.AF_INET,
            socket.SOCK_STREAM,
            socket.IPPROTO_TCP,
            '',
            ('10.20.30.40', 443),
        )]

    monkeypatch.setattr('app.url_safety.socket.getaddrinfo', private_dns)
    headers = {**HEADERS, 'X-API-Base-URL': 'https://private.provider.example/v1'}
    with TestClient(create_app(
        Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline'),
        provider_transport=httpx.MockTransport(handler),
    )) as client:
        response = client.post('/api/provider/test', headers=headers)

    assert response.status_code == 422
    assert called is False
    assert HEADERS['X-API-Key'] not in response.text
    assert_secret_absent(HEADERS['X-API-Key'], response, tmp_path)


def test_provider_test_does_not_follow_redirects(tmp_path, public_dns):
    requested_urls = []

    def handler(request):
        requested_urls.append(str(request.url))
        return httpx.Response(302, headers={'Location': 'http://169.254.169.254/latest/meta-data/'})

    with TestClient(create_app(
        Settings(_env_file=None, data_dir=tmp_path, llm_mode='offline'),
        provider_transport=httpx.MockTransport(handler),
    )) as client:
        response = client.post('/api/provider/test', headers=HEADERS)

    assert response.status_code == 502
    assert response.json() == {
        'detail': '上游模型服务返回了重定向，已为安全起见拒绝跟随。',
    }
    assert requested_urls == ['https://93.184.216.34/v1/chat/completions']
    assert_secret_absent(HEADERS['X-API-Key'], response, tmp_path)
