import asyncio
import socket

import httpx
import pytest
from app.config import Settings
from app.provider_probe import ProviderTestFailure, probe_provider
from app.url_safety import UnsafeProviderURL, resolve_provider_endpoint

GLOBAL_IPV4 = '93.184.216.34'
GLOBAL_IPV6 = '2606:4700:4700::1111'


def resolve_to(*addresses):
    def fake_getaddrinfo(host, port, *, type):
        assert type == socket.SOCK_STREAM
        return [
            (
                socket.AF_INET6 if ':' in address else socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                '',
                (address, port, 0, 0) if ':' in address else (address, port),
            )
            for address in addresses
        ]

    return fake_getaddrinfo


def settings_for(base_url):
    return Settings(
        _env_file=None,
        data_dir='.',
        api_key='pinned-provider-secret',
        base_url=base_url,
        model='provider-model',
        llm_mode='online',
    )


@pytest.mark.parametrize('resolved_ip', [GLOBAL_IPV4, GLOBAL_IPV6])
def test_provider_probe_connects_to_resolved_ip_and_preserves_host_and_sni(monkeypatch, resolved_ip):
    requests = []
    monkeypatch.setattr('app.url_safety.socket.getaddrinfo', resolve_to(resolved_ip))

    def handler(value):
        requests.append(value)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    result = asyncio.run(probe_provider(
        settings_for('https://provider.example:8443/v1/'),
        httpx.MockTransport(handler),
    ))

    expected_url = (
        f'https://[{resolved_ip}]:8443/v1/chat/completions'
        if ':' in resolved_ip
        else f'https://{resolved_ip}:8443/v1/chat/completions'
    )
    assert result['ok'] is True
    assert len(requests) == 1
    request = requests[0]
    assert str(request.url) == expected_url
    assert request.headers['host'] == 'provider.example:8443'
    assert request.extensions['sni_hostname'] == 'provider.example'
    assert request.headers['authorization'] == 'Bearer pinned-provider-secret'


def test_provider_probe_retries_only_validated_addresses(monkeypatch):
    attempted = []
    monkeypatch.setattr('app.url_safety.socket.getaddrinfo', resolve_to(GLOBAL_IPV4, GLOBAL_IPV6))

    def handler(request):
        attempted.append(request.url.host)
        if request.url.host == GLOBAL_IPV4:
            raise httpx.ConnectError('IPv4 route unavailable', request=request)
        assert request.headers['host'] == 'provider.example'
        assert request.extensions['sni_hostname'] == 'provider.example'
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    result = asyncio.run(probe_provider(
        settings_for('https://provider.example/v1/'),
        httpx.MockTransport(handler),
    ))

    assert result['ok'] is True
    assert attempted == [GLOBAL_IPV4, GLOBAL_IPV6]


@pytest.mark.parametrize('resolved_ip', [GLOBAL_IPV4, GLOBAL_IPV6])
def test_provider_probe_does_not_resolve_an_explicit_ip_again(monkeypatch, resolved_ip):
    request = None

    def unexpected_dns(*args, **kwargs):
        raise AssertionError('explicit IP must not be resolved through DNS')

    monkeypatch.setattr('app.url_safety.socket.getaddrinfo', unexpected_dns)

    def handler(value):
        nonlocal request
        request = value
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    url_host = f'[{resolved_ip}]' if ':' in resolved_ip else resolved_ip
    result = asyncio.run(probe_provider(
        settings_for(f'https://{url_host}/v1/'),
        httpx.MockTransport(handler),
    ))

    assert result['ok'] is True
    assert request is not None
    assert request.url.host == resolved_ip
    expected_host = f'[{resolved_ip}]' if ':' in resolved_ip else resolved_ip
    assert request.headers['host'] == expected_host
    assert 'sni_hostname' not in request.extensions


def test_provider_validation_rejects_mixed_public_and_private_dns(monkeypatch):
    monkeypatch.setattr(
        'app.url_safety.socket.getaddrinfo',
        resolve_to(GLOBAL_IPV4, '10.20.30.40'),
    )

    with pytest.raises(UnsafeProviderURL, match='私网'):
        resolve_provider_endpoint('https://provider.example/v1/')


def test_provider_probe_rejects_dns_failure_before_transport(monkeypatch):
    called = False

    def failed_dns(*args, **kwargs):
        raise socket.gaierror(socket.EAI_AGAIN, 'temporary DNS failure')

    def handler(value):
        nonlocal called
        called = True
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr('app.url_safety.socket.getaddrinfo', failed_dns)

    with pytest.raises(ProviderTestFailure) as raised:
        asyncio.run(probe_provider(
            settings_for('https://provider.example/v1/'),
            httpx.MockTransport(handler),
        ))

    assert raised.value.status_code == 502
    assert called is False


@pytest.mark.parametrize(
    'response',
    [
        httpx.Response(200, text='<html>not compatible</html>'),
        httpx.Response(200, json={'data': []}),
        httpx.Response(200, json={'choices': []}),
    ],
)
def test_provider_probe_rejects_non_compatible_success_payloads(monkeypatch, response):
    monkeypatch.setattr(
        'app.url_safety.socket.getaddrinfo',
        resolve_to(GLOBAL_IPV4),
    )

    with pytest.raises(ProviderTestFailure) as raised:
        asyncio.run(probe_provider(
            settings_for('https://provider.example/v1/'),
            httpx.MockTransport(lambda _request: response),
        ))

    assert raised.value.status_code == 502
    assert '兼容' in raised.value.detail
