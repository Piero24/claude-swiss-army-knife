FROM python:3.12-slim

ARG PERMISSION_ENGINE_PATH=shared/mcp-permission-engine
ARG PROXY_PATH=shared/mcp-proxy

RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

COPY ${PERMISSION_ENGINE_PATH} /tmp/permission-engine
COPY ${PROXY_PATH} /tmp/mcp-proxy
RUN pip install --no-cache-dir /tmp/permission-engine /tmp/mcp-proxy && rm -rf /tmp/permission-engine /tmp/mcp-proxy

COPY src /app/src
WORKDIR /app
ENTRYPOINT ["python", "-m", "src.server"]
