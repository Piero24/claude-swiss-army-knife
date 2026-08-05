FROM python:3.12-alpine AS builder

ARG PERMISSION_ENGINE_PATH=shared/mcp-permission-engine
WORKDIR /app

# Install shared permission engine
COPY ${PERMISSION_ENGINE_PATH} /tmp/permission-engine
RUN pip install --no-cache-dir /tmp/permission-engine && \
    rm -rf /tmp/permission-engine

# Install link-manager
COPY . /app
RUN pip install --no-cache-dir .

FROM python:3.12-alpine
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /app /app

# Create non-root user
RUN adduser -D -h /app mcp && chown -R mcp:mcp /app
USER mcp

ENTRYPOINT ["python", "-m", "link_manager"]
