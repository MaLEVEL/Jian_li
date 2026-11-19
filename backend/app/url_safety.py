import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import SplitResult, urlsplit


class UnsafeProviderURL(ValueError):
    pass


@dataclass(frozen=True)
class ResolvedProviderEndpoint:
    scheme: str
    hostname: str
    port: int
    addresses: tuple[str, ...]
    host_header: str
    sni_hostname: str | None


_LOOPBACK_HOSTS = {'localhost'}


def _validated_target(value: str) -> tuple[SplitResult, str, str, ipaddress.IPv4Address | ipaddress.IPv6Address | None]:
    if not value or any(character.isspace() for character in value) or '\\' in value:
        raise UnsafeProviderURL('Provider 地址格式不安全')
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        raise UnsafeProviderURL('Provider 地址格式不安全') from None
    scheme = parsed.scheme.casefold()
    host = (parsed.hostname or '').rstrip('.').casefold()
    if (
        scheme not in {'http', 'https'}
        or not host
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or port == 0
    ):
        raise UnsafeProviderURL('Provider 地址必须为不含凭据的 HTTP(S) 地址')

    try:
        ascii_host = host.encode('idna').decode('ascii')
    except UnicodeError:
        raise UnsafeProviderURL('Provider 地址主机名无效') from None

    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None

    if address is not None:
        if not address.is_loopback and not address.is_global:
            raise UnsafeProviderURL('Provider 地址不能指向私网、链路本地或保留地址')
        if scheme == 'http' and not address.is_loopback:
            raise UnsafeProviderURL('非本机 Provider 地址必须使用 HTTPS')
    elif host in _LOOPBACK_HOSTS:
        pass
    elif scheme != 'https':
        raise UnsafeProviderURL('非本机 Provider 地址必须使用 HTTPS')
    return parsed, scheme, ascii_host, address


def _address_from_sockaddr(value: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address:
    address = ipaddress.ip_address(value.split('%', 1)[0])
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        return address.ipv4_mapped
    return address


def _host_header(host: str, port: int | None) -> str:
    rendered = f'[{host}]' if ':' in host else host
    return f'{rendered}:{port}' if port is not None else rendered


def resolve_provider_endpoint(value: str) -> ResolvedProviderEndpoint:
    """Validate a provider URL and resolve its connection target exactly once."""
    parsed, scheme, host, direct_address = _validated_target(value)
    explicit_port = parsed.port
    default_port = 443 if scheme == 'https' else 80
    port = explicit_port or default_port

    if direct_address is not None:
        addresses = (str(direct_address),)
    else:
        resolved = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        addresses = tuple(dict.fromkeys(
            str(_address_from_sockaddr(entry[4][0]))
            for entry in resolved
        ))
        if not addresses:
            raise socket.gaierror(socket.EAI_NONAME, 'Provider 域名没有可用地址')

    allow_loopback = host in _LOOPBACK_HOSTS or (
        direct_address is not None and direct_address.is_loopback
    )
    for value_address in addresses:
        address = ipaddress.ip_address(value_address)
        if allow_loopback:
            if not address.is_loopback:
                raise UnsafeProviderURL('本机 Provider 域名不能解析到非 loopback 地址')
        elif not address.is_global:
            raise UnsafeProviderURL('Provider 域名不能解析到私网、链路本地或保留地址')

    return ResolvedProviderEndpoint(
        scheme=scheme,
        hostname=host,
        port=port,
        addresses=addresses,
        host_header=_host_header(host, explicit_port),
        sni_hostname=host if scheme == 'https' and direct_address is None else None,
    )


def validate_provider_url(value: str, *, resolve_dns: bool = False) -> str:
    """Reject provider endpoints that could reach local or special-use networks."""
    _validated_target(value)
    if resolve_dns:
        try:
            resolve_provider_endpoint(value)
        except socket.gaierror:
            # Preserve the normal transport error path for unresolved, user-supplied
            # host names while still rejecting every address that does resolve.
            pass
    return value
