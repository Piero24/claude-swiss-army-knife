FROM python:3.12-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ripgrep \
    && rm -rf /var/lib/apt/lists/*

# Install shared permission engine
COPY mcp-servers/shared/mcp-permission-engine /tmp/permission-engine
RUN pip install --no-cache-dir /tmp/permission-engine && \
    rm -rf /tmp/permission-engine

WORKDIR /app

COPY mcp-servers/obsidian/pyproject.toml .
COPY mcp-servers/obsidian/src/ ./src/
RUN pip install --no-cache-dir -e .

ENTRYPOINT ["python", "-m", "obsidian_mcp"]
CMD ["--config-dir", "/app/configs/obsidian"]
