FROM python:3.12-slim AS base

# Install shared permission engine
COPY mcp-servers/shared/mcp-permission-engine /tmp/permission-engine
RUN pip install --no-cache-dir /tmp/permission-engine && \
    rm -rf /tmp/permission-engine

WORKDIR /app

# Copy source and install
COPY mcp-servers/synology-nas/pyproject.toml .
COPY mcp-servers/synology-nas/src/ ./src/
RUN pip install --no-cache-dir -e .

ENTRYPOINT ["python", "-m", "synology_mcp"]
CMD ["--config-dir", "/app/configs/synology-nas"]
