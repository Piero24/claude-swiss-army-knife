---
sidebar_position: 3
---

# Getting Help

## Community Resources

- **GitHub Issues**: [Report bugs, request features](https://github.com/Piero24/claude-swiss-army-knife/issues)
- **GitHub Discussions**: [Ask questions, share setups](https://github.com/Piero24/claude-swiss-army-knife/discussions)
- **Issue Templates**: Use the appropriate template (bug report, feature request, question, security, documentation, config help)

## Before Opening an Issue

1. **Check the FAQ**: Your question may already be answered in the [FAQ](/user/troubleshooting/faq)
2. **Check existing issues**: Someone may have already reported the same problem
3. **Check the audit logs**: Many issues leave a clear trace in the audit log
4. **Check container logs**: `docker compose logs <service>` often has the answer
5. **Run the health check**: `bash scripts/health-check.sh`

## Information to Include

When reporting a bug, include:

```bash
# System information
docker --version
docker compose version
uname -a

# Container status
docker compose ps

# Relevant logs (sanitized — remove credentials)
docker compose logs <failing-service> --tail 50

# Config (sanitized)
cat configs/<server>.yaml

# Steps to reproduce
# 1. What you did
# 2. What you expected
# 3. What actually happened
```

## Security Issues

If you discover a security vulnerability, please **do not** open a public issue. Use the [security issue template](https://github.com/Piero24/claude-swiss-army-knife/issues/new?template=05-security.md) or contact the maintainer directly.
