FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy permission engine
COPY mcp-servers/shared/mcp-permission-engine /app/shared/mcp-permission-engine
RUN pip install --no-cache-dir -e /app/shared/mcp-permission-engine

# Install gateway dependencies
RUN pip install --no-cache-dir fastapi uvicorn httpx pyyaml pydantic

# Copy application files
COPY mcp-servers/shared/mcp-gateway/main.py /app/main.py

EXPOSE 8280

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8280"]
