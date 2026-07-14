"""Tests for the audit logger."""

import json
import tempfile
from pathlib import Path

import pytest
from permission_engine.audit import AuditLogger, read_audit_log


@pytest.fixture
def audit_logger():
    """Create an audit logger with a temp log file."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".log", delete=False
    ) as f:
        path = f.name

    logger = AuditLogger(path)
    yield logger
    # Cleanup
    log_file = Path(path)
    if log_file.exists():
        log_file.unlink()


class TestAuditLogger:
    """Tests for audit logging."""

    def test_log_allowed(self, audit_logger):
        audit_logger.allowed(
            "test-mcp",
            "file",
            "/var/log/test.log",
            access="read",
            granted="read",
        )
        entries = read_audit_log(audit_logger._log_path)
        assert len(entries) == 1
        entry = entries[0]
        assert entry["result"] == "allowed"
        assert entry["server"] == "test-mcp"
        assert entry["target_type"] == "file"
        assert entry["target"] == "/var/log/test.log"

    def test_log_denied(self, audit_logger):
        audit_logger.denied(
            "test-mcp", "file", "/etc/shadow", reason="no matching rule"
        )
        entries = read_audit_log(audit_logger._log_path)
        assert len(entries) == 1
        entry = entries[0]
        assert entry["result"] == "denied"
        assert entry["target"] == "/etc/shadow"
        assert entry["reason"] == "no matching rule"

    def test_log_multiple_entries(self, audit_logger):
        for i in range(10):
            audit_logger.allowed(
                "test-mcp",
                "file",
                f"/path/to/file_{i}.txt",
                access="read",
                granted="read",
            )

        entries = read_audit_log(audit_logger._log_path)
        assert len(entries) == 10

    def test_limit(self, audit_logger):
        for i in range(200):
            audit_logger.allowed(
                "test-mcp",
                "file",
                f"/path/to/file_{i}.txt",
                access="read",
                granted="read",
            )

        entries = read_audit_log(audit_logger._log_path, limit=50)
        assert len(entries) == 50

    def test_most_recent_first(self, audit_logger):
        for i in range(5):
            audit_logger.allowed(
                "test-mcp",
                "file",
                f"/path/file_{i}.txt",
                access="read",
                granted="read",
            )

        entries = read_audit_log(audit_logger._log_path)
        # Most recent first (file_4 is last written, first returned)
        assert "file_4" in entries[0]["target"]

    def test_result_filter(self, audit_logger):
        audit_logger.allowed(
            "test-mcp",
            "file",
            "/path/allowed.txt",
            access="read",
            granted="read",
        )
        audit_logger.denied(
            "test-mcp", "file", "/path/denied.txt", reason="test"
        )
        audit_logger.allowed(
            "test-mcp",
            "file",
            "/path/allowed2.txt",
            access="read",
            granted="read",
        )

        allowed = read_audit_log(
            audit_logger._log_path, result_filter="allowed"
        )
        assert len(allowed) == 2
        assert all(e["result"] == "allowed" for e in allowed)

        denied = read_audit_log(audit_logger._log_path, result_filter="denied")
        assert len(denied) == 1
        assert denied[0]["result"] == "denied"

    def test_read_nonexistent_log(self):
        entries = read_audit_log("/nonexistent/path/audit.log")
        assert entries == []

    def test_entry_has_timestamp(self, audit_logger):
        audit_logger.allowed("test", "file", "/test")
        entries = read_audit_log(audit_logger._log_path)
        assert "ts" in entries[0]
        assert entries[0]["ts"].endswith("Z")

    def test_json_lines_format(self, audit_logger):
        """Each line should be valid JSON."""
        audit_logger.allowed("test", "file", "/test1")
        audit_logger.allowed("test", "file", "/test2")

        with open(audit_logger._log_path, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    parsed = json.loads(line)
                    assert "ts" in parsed
                    assert "result" in parsed

    def test_command_audit(self, audit_logger):
        audit_logger.allowed(
            "test-mcp",
            "command",
            "systemctl status nginx",
            access="execute",
            granted="read",
        )
        entries = read_audit_log(audit_logger._log_path)
        assert entries[0]["target_type"] == "command"
        assert entries[0]["target"] == "systemctl status nginx"

    def test_agent_id_default(self, audit_logger):
        """agent_id defaults to 'default' when not provided."""
        audit_logger.allowed("test-mcp", "file", "/test")
        entries = read_audit_log(audit_logger._log_path)
        assert entries[0].get("agent_id") == "default"

    def test_agent_id_custom_allowed(self, audit_logger):
        """Custom agent_id flows through to log entry (allowed)."""
        audit_logger.allowed(
            "test-mcp",
            "file",
            "/test",
            access="read",
            granted="read",
            agent_id="alice",
        )
        entries = read_audit_log(audit_logger._log_path)
        assert entries[0].get("agent_id") == "alice"

    def test_agent_id_custom_denied(self, audit_logger):
        """Custom agent_id flows through to log entry (denied)."""
        audit_logger.denied(
            "test-mcp",
            "file",
            "/secret",
            reason="nope",
            agent_id="bob",
        )
        entries = read_audit_log(audit_logger._log_path)
        assert entries[0].get("agent_id") == "bob"
