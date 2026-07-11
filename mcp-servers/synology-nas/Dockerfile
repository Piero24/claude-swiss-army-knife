FROM python:3.12-slim AS base

ARG PERMISSION_ENGINE_PATH=shared/mcp-permission-engine

# Install shared permission engine
COPY ${PERMISSION_ENGINE_PATH} /tmp/permission-engine
RUN pip install --no-cache-dir /tmp/permission-engine && \
    rm -rf /tmp/permission-engine

WORKDIR /app

# Copy source and install
COPY pyproject.toml .
COPY src/ ./src/
RUN pip install --no-cache-dir -e .

ENTRYPOINT ["python", "-m", "synology_mcp"]
CMD ["--config", "/app/config.yaml"]
