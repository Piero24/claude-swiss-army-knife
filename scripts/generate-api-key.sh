#!/bin/bash
# Generate a secure random API key for the MCP Web UI
# Usage: bash scripts/generate-api-key.sh

KEY=$(openssl rand -hex 32)
echo "Generated API key: $KEY"
echo ""
echo "Add this to your .env file:"
echo "  WEBUI_API_KEY=$KEY"
echo ""
echo "Or run:"
echo "  echo \"WEBUI_API_KEY=$KEY\" >> .env"
