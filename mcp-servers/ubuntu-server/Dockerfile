FROM python:3.12-slim AS base

# Install system dependencies (docker.io provides the docker CLI for docker ps/logs/restart)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ripgrep \
    procps \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

# Build arg: relative path to shared permission engine
ARG PERMISSION_ENGINE_PATH=shared/mcp-permission-engine

# Install shared permission engine
COPY ${PERMISSION_ENGINE_PATH} /tmp/permission-engine
RUN pip install --no-cache-dir /tmp/permission-engine && \
    rm -rf /tmp/permission-engine

WORKDIR /app

# Install psutil (for system_info)
RUN pip install --no-cache-dir psutil

# Copy source
COPY pyproject.toml .
COPY src/ ./src/
COPY templates/ /app/templates/

# Install the package in development mode so it can be run
RUN pip install --no-cache-dir -e ".[remote]"

# MCP server communicates over stdio — no port needed
ENTRYPOINT ["python", "-m", "ubuntu_mcp"]
CMD ["--config", "/app/config.yaml"]
