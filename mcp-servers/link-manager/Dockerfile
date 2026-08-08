FROM python:3.12-alpine AS builder

WORKDIR /app

# Install shared permission engine
COPY mcp-servers/shared/mcp-permission-engine /tmp/permission-engine
RUN pip install --no-cache-dir /tmp/permission-engine && \
    rm -rf /tmp/permission-engine

# Install link-manager
COPY mcp-servers/link-manager/ /app
RUN pip install --no-cache-dir .

FROM python:3.12-alpine
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /app /app

ENTRYPOINT ["python", "-m", "link_manager"]
