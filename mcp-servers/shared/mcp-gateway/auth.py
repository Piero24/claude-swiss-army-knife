"""Edge authentication and tool-level authorization for the MCP gateway."""

from typing import Any

from fastapi import HTTPException, Request, status
from permission_engine import ForbiddenError, PermissionEnforcer
from permission_engine.users import AuthenticationError, load_users, validate_user

from config import CONFIGS_DIR, USERS_FILE, logger
from webhooks import notify_security_event


def extract_credentials(
    authorization: str | None,
    x_mcp_user_id: str | None,
    request: Request | None = None,
) -> tuple[str, str]:
    """Extract user ID and bearer key from request headers.

    Raises HTTPException(401) if either header is missing or empty.
    """
    user_id = x_mcp_user_id or ""
    user_key = ""
    if authorization and authorization.startswith("Bearer "):
        user_key = authorization[7:].strip()

    if not user_id or not user_key:
        if request:
            notify_security_event(
                event="missing_credentials",
                request=request,
                http_status=status.HTTP_401_UNAUTHORIZED,
                error_type="MissingCredentials",
                error_reason="Missing Authorization Bearer token or X-MCP-User-ID header",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization Bearer token or X-MCP-User-ID header",
        )
    return user_id, user_key


def verify_and_enforce(
    server_name: str,
    user_id: str,
    user_key: str,
    tool_name: str | None = None,
    tool_args: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    """Authenticate the user, then enforce tool-level access if a tool is named.

    Raises HTTPException(401) on auth failure, HTTPException(403) on forbidden
    tool access, or HTTPException(500) on enforcer errors.
    """
    # ---- 1. User authentication -------------------------------------------
    users = load_users(str(USERS_FILE))
    try:
        validate_user(users, user_id, user_key)
    except AuthenticationError as e:
        logger.warning("Auth failed for user=%s: %s", user_id, e)
        if request:
            notify_security_event(
                event="auth_failed",
                request=request,
                http_status=status.HTTP_401_UNAUTHORIZED,
                server_name=server_name,
                user_id=user_id,
                error_type="AuthenticationError",
                error_reason=str(e),
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)
        )

    # ---- 2. Tool-level authorisation (messages only) ----------------------
    # SSE handshakes must be fast — PermissionEnforcer loads the full per-user
    # YAML config (which can be many MB due to auto-discovered paths).
    # Tool-level checks only run on /messages, not on /sse.
    if not tool_name:
        return

    # Resolve the server config file (try multiple naming conventions)
    server_config_file = CONFIGS_DIR / server_name / f"{user_id}.yaml"
    if not server_config_file.exists():
        server_config_file = (
            CONFIGS_DIR / f"{server_name}-mcp" / f"{user_id}.yaml"
        )
    if not server_config_file.exists():
        server_config_file = CONFIGS_DIR / f"{server_name}.yaml"
    if not server_config_file.exists():
        server_config_file = CONFIGS_DIR / f"{server_name}-mcp.yaml"

    if server_config_file.exists():
        try:
            enforcer = PermissionEnforcer(str(server_config_file))
            enforcer.check_tool_access(user_id, tool_name)
        except ForbiddenError as e:
            logger.warning(
                "Access denied for user=%s tool=%s: %s", user_id, tool_name, e
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail=str(e)
            )
        except Exception as e:
            logger.error("Enforcer error for user=%s: %s", user_id, e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Enforcer error: {e}",
            )
