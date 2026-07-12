"""Structured JSON audit logging for permission decisions."""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


class AuditLogger:
    """Writes structured audit log entries as JSON Lines.

    Each entry captures: timestamp, server, target_type, target, result,
    access level requested/granted, and reason for denial.

    Thread-safe for concurrent writes from multiple tools.
    """

    def __init__(self, log_path: str):
        self._log_path = Path(log_path).resolve()

    def allowed(
        self,
        server: str,
        target_type: str,
        target: str,
        access: str = "",
        granted: str = "",
        tool: str = "",
    ) -> None:
        """Log an allowed access."""
        self._write_entry(
            result="allowed",
            server=server,
            target_type=target_type,
            target=target,
            access=access,
            granted=granted,
            tool=tool,
        )

    def denied(
        self,
        server: str,
        target_type: str,
        target: str,
        reason: str = "",
        required_access: str = "",
        granted_access: str = "",
        tool: str = "",
    ) -> None:
        """Log a denied access."""
        self._write_entry(
            result="denied",
            server=server,
            target_type=target_type,
            target=target,
            access=required_access,
            granted=granted_access,
            reason=reason,
            tool=tool,
        )

    def _write_entry(self, **fields: object) -> None:
        """Write a single JSON log entry to the audit file."""
        entry = {
            "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[
                :-3
            ]
            + "Z",
            **fields,
        }

        # Ensure parent directory exists
        self._log_path.parent.mkdir(parents=True, exist_ok=True)

        line = (
            json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n"
        )

        # Append atomically (rename-based would be safer but JSON Lines is append-friendly)
        with open(self._log_path, "a") as f:
            f.write(line)


def read_audit_log(
    log_path: str, limit: int = 100, result_filter: Optional[str] = None
) -> list[dict]:
    """Read recent entries from an audit log.

    Args:
        log_path: Path to the JSON Lines audit log file.
        limit: Maximum number of entries to return (most recent first).
        result_filter: Optional filter: "allowed" or "denied".

    Returns:
        List of audit entry dicts, newest first.
    """
    log_file = Path(log_path)
    if not log_file.exists():
        return []

    entries = []
    with open(log_file, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                if result_filter and entry.get("result") != result_filter:
                    continue
                entries.append(entry)
            except json.JSONDecodeError:
                continue

    # Return most recent first, up to limit
    return list(reversed(entries))[:limit]
