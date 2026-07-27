---
sidebar_position: 2
---

# Code Style

Style guides and tooling configuration for the project.

## Python

### Formatter: pyink

Google's Python formatter configured in `pyproject.toml`:

```toml
[tool.pyink]
line-length = 80
target-version = ["py312"]
```

### Linter: pylint

```toml
[tool.pylint.main]
ignore = ["tests", ".venv"]

[tool.pylint.format]
max-line-length = 80

[tool.pylint.messages_control]
disable = [
    "C0114",  # missing-module-docstring
    "C0115",  # missing-class-docstring
    "C0116",  # missing-function-docstring
    "R0903",  # too-few-public-methods
    "R0801",  # duplicate-code
]
```

### Conventions

- **Type hints**: All public functions must have type annotations
- **Docstrings**: Classes and public methods should have docstrings (Google style)
- **Naming**: `snake_case` for functions/variables, `PascalCase` for classes
- **Imports**: Standard library → third-party → local, alphabetical within groups
- **Async**: Use `async/await` throughout; never mix with sync I/O

## TypeScript

### ESLint

Configured in `mcp-webui/eslint.config.mjs` with Next.js defaults.

### TypeScript Config

Strict mode enabled:

```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true
  }
}
```

### Conventions

- **Interfaces over types** for public APIs
- **Explicit return types** on exported functions
- **No `any`** without a comment explaining why
- **Use `as const`** for literal types
- **Prefer `?.` and `??`** over nested ternary operators

## Commit Messages

Follow conventional commits:

- `feat: add Obsidian MCP wikilink resolution`
- `fix: prevent path traversal in safe_resolve_path`
- `docs: expand permission engine documentation`
- `refactor: extract audit logger to separate module`
- `test: add tests for command injection prevention`

## Branch Naming

- `feat/<description>` for features
- `fix/<description>` for fixes
- `docs/<description>` for documentation
- `refactor/<description>` for refactoring
