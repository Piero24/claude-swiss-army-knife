FROM python:3.12-slim

RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

# Install shared permission engine and proxy
COPY mcp-servers/shared/mcp-permission-engine /tmp/permission-engine
COPY mcp-servers/shared/mcp-proxy /tmp/mcp-proxy
RUN pip install --no-cache-dir /tmp/permission-engine /tmp/mcp-proxy && rm -rf /tmp/permission-engine /tmp/mcp-proxy

WORKDIR /app

COPY mcp-servers/github/src /app/src
ENTRYPOINT ["python", "-m", "src.server"]
