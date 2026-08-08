FROM alpine:3.19

RUN apk add --no-cache openssh-server bash docker-cli python3 py3-yaml shadow

# Create unprivileged user mcpuser
RUN useradd -m -s /bin/bash mcpuser && \
    echo "mcpuser:mcpuser" | chpasswd

# Copy configuration and launcher scripts
COPY sshd_config /etc/ssh/sshd_config
COPY mcp-launcher.sh /usr/local/bin/mcp-launcher.sh
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /usr/local/bin/mcp-launcher.sh /entrypoint.sh

EXPOSE 2222

ENTRYPOINT ["/entrypoint.sh"]
