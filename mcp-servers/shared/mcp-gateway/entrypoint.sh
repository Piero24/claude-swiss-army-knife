#!/bin/bash
set -e

# Generate host keys if not present
ssh-keygen -A

# Ensure runtime dir for sshd
mkdir -p /var/run/sshd

# Optionally override mcpuser password if MCP_SSH_PASSWORD env var is set
if [ -n "$MCP_SSH_PASSWORD" ]; then
  echo "mcpuser:${MCP_SSH_PASSWORD}" | chpasswd
fi

# Optionally add public key if MCP_SSH_PUBLIC_KEY env var is set
if [ -n "$MCP_SSH_PUBLIC_KEY" ]; then
  mkdir -p /home/mcpuser/.ssh
  echo "$MCP_SSH_PUBLIC_KEY" > /home/mcpuser/.ssh/authorized_keys
  chmod 700 /home/mcpuser/.ssh
  chmod 600 /home/mcpuser/.ssh/authorized_keys
  chown -R mcpuser:mcpuser /home/mcpuser/.ssh
fi

# Start OpenSSH in foreground
exec /usr/sbin/sshd -D -e -p 2222
