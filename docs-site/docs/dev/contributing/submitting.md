---
sidebar_position: 4
---

# Submitting Changes

How to contribute code to the project.

## Workflow

1. **Fork the repository** on GitHub
2. **Create a branch**: `feat/my-feature` or `fix/my-fix`
3. **Make changes**: Follow the [code style](/dev/contributing/code-style) guide
4. **Run tests locally**:
   ```bash
   cd mcp-servers/shared/mcp-permission-engine && python -m pytest tests/ -v
   cd mcp-webui && npm run typecheck && npm test
   ```
5. **Commit** with a descriptive message
6. **Push** to your fork
7. **Open a pull request** against `main`

## PR Guidelines

- **One concern per PR**: Don't mix feature changes with refactoring
- **Description**: Explain what, why, and any trade-offs
- **Tests**: Add tests for new functionality
- **Screenshots**: Include for UI changes
- **Breaking changes**: Call them out explicitly

## PR Template

Fill in the PR description with:
1. What does this change do?
2. Why is it needed?
3. How was it tested?
4. Any breaking changes?
5. Screenshots (if UI changes)

## Review Process

- CI must pass (lint, test, build)
- At least one maintainer review required
- Address review feedback
- Squash merge into `main`

## Issue Templates

Use the appropriate template when opening issues:
- **Bug Report**: Steps to reproduce, expected vs actual behavior, logs
- **Feature Request**: Use case, proposed solution, alternatives considered
- **Documentation**: What's missing or incorrect
- **Security**: Use the security template (private disclosure)
