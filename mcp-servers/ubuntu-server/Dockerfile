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

# Install shared permission engine
COPY mcp-servers/shared/mcp-permission-engine /tmp/permission-engine
RUN pip install --no-cache-dir /tmp/permission-engine && \
    rm -rf /tmp/permission-engine

WORKDIR /app

# Install psutil (for system_info)
RUN pip install --no-cache-dir psutil

# Copy source
COPY mcp-servers/ubuntu-server/pyproject.toml .
COPY mcp-servers/ubuntu-server/src/ ./src/

# Install the package in development mode
RUN pip install --no-cache-dir -e ".[remote]"

# MCP server communicates over stdio — no port needed
ENTRYPOINT ["python", "-m", "ubuntu_mcp"]
CMD ["--config-dir", "/app/configs/ubuntu-server"]
