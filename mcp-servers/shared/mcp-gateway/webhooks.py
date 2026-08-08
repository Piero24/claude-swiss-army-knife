"""Security webhook notifier — fire-and-forget POSTs on gateway security events."""

import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import Request

from config import SECURITY_WEBHOOK_URL, logger


def resolve_client_info(request: Request) -> dict:
    """Extract client IP and proxy headers from the request."""
    x_forwarded_for = request.headers.get("X-Forwarded-For", "")
    x_real_ip = request.headers.get("X-Real-IP", "")
    cf_connecting_ip = request.headers.get("CF-Connecting-IP", "")
    cf_ipcountry = request.headers.get("CF-IPCountry", "")
    cf_ray = request.headers.get("CF-Ray", "")

    # Resolve best IP: CF-Connecting-IP → X-Real-IP → first X-Forwarded-For → direct client
    resolved_ip = (
        cf_connecting_ip
        or x_real_ip
        or (x_forwarded_for.split(",")[0].strip() if x_forwarded_for else "")
        or (request.client.host if request.client else "")
    )

    cloudflare: dict[str, str] = {}
    if cf_connecting_ip or cf_ipcountry or cf_ray:
        cloudflare["connecting_ip"] = cf_connecting_ip
        cloudflare["country"] = cf_ipcountry
        cloudflare["ray_id"] = cf_ray

    return {
        "ip": resolved_ip,
        "forwarded_for": x_forwarded_for,
        "real_ip": x_real_ip,
        "user_agent": request.headers.get("User-Agent", ""),
        **({"cloudflare": cloudflare} if cloudflare else {}),
    }


def sanitize_header_value(name: str, value: str) -> str:
    """Sanitize sensitive header values — truncate Authorization tokens."""
    if name.lower() == "authorization" and len(value) > 15:
        return value[:12] + "***"
    return value


def build_security_payload(
    event: str,
    request: Request,
    http_status: int,
    server_name: str = "",
    user_id: str = "",
    error_type: str = "",
    error_reason: str = "",
) -> dict:
    """Build the JSON payload for a security webhook."""
    security_headers = {
        "authorization",
        "x-mcp-user-id",
        "content-type",
        "user-agent",
        "cf-ipcountry",
        "cf-connecting-ip",
        "cf-ray",
        "x-forwarded-for",
        "x-real-ip",
    }
    headers = {
        k.lower(): sanitize_header_value(k, v)
        for k, v in request.headers.items()
        if k.lower() in security_headers
    }

    return {
        "event": event,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gateway": "mcp-gateway",
        "http": {
            "method": request.method,
            "path": request.url.path,
            "status": http_status,
        },
        "server": {"name": server_name} if server_name else {},
        "user": {
            "id": user_id,
            "authenticated": event
            not in ("missing_credentials", "auth_failed"),
        },
        "error": {
            "type": error_type,
            "reason": error_reason,
        },
        "client": resolve_client_info(request),
        "headers": headers,
    }


async def post_webhook(payload: dict) -> None:
    """Fire-and-forget: POST the payload to the security webhook URL."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(SECURITY_WEBHOOK_URL, json=payload)
    except Exception as exc:
        logger.warning(
            "Security webhook failed to %s: %s", SECURITY_WEBHOOK_URL, exc
        )


def notify_security_event(
    event: str,
    request: Request,
    http_status: int,
    server_name: str = "",
    user_id: str = "",
    error_type: str = "",
    error_reason: str = "",
) -> None:
    """Schedule a fire-and-forget security webhook notification.

    Returns immediately — the POST runs in a background task so it never
    delays the error response sent to the client.
    """
    if not SECURITY_WEBHOOK_URL:
        return
    payload = build_security_payload(
        event=event,
        request=request,
        http_status=http_status,
        server_name=server_name,
        user_id=user_id,
        error_type=error_type,
        error_reason=error_reason,
    )
    asyncio.create_task(post_webhook(payload))
