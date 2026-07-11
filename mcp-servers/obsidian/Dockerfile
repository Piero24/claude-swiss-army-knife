FROM python:3.12-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ripgrep \
    && rm -rf /var/lib/apt/lists/*

ARG PERMISSION_ENGINE_PATH=shared/mcp-permission-engine

COPY ${PERMISSION_ENGINE_PATH} /tmp/permission-engine
RUN pip install --no-cache-dir /tmp/permission-engine && \
    rm -rf /tmp/permission-engine

WORKDIR /app

COPY pyproject.toml .
COPY src/ ./src/
RUN pip install --no-cache-dir -e .

ENTRYPOINT ["python", "-m", "obsidian_mcp"]
CMD ["--config", "/app/config.yaml"]
