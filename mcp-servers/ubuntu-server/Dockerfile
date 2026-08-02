FROM python:3.12-slim AS base

# Install system dependencies + docker CLI (for docker ps/logs/restart commands)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ripgrep \
    procps \
    ca-certificates \
    curl \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli \
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
