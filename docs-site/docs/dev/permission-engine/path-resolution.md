---
sidebar_position: 3
---

# Path Resolution

The `PathResolver` class determines whether a given filesystem path is accessible based on the configured path rules.

## Resolution Algorithm

```python
class PathResolver:
    def __init__(self, rules: list[PathRule], default_access: AccessLevel):
        # Sort rules: explicit denies first, then by specificity (longest path)
        self._rules = sorted(rules, key=lambda r: (
            0 if r.access == AccessLevel.NONE else 1,
            -len(r.path)
        ))

    def resolve(self, requested_path: str) -> AccessLevel:
        for rule in self._rules:
            if self._path_matches(requested_path, rule.path):
                return rule.access
        return self._default_access
```

## Rule Sorting

Rules are evaluated in this order:

1. **Explicit denies first** (`access: none`): A deny rule always takes priority over any allow rule, regardless of pattern length
2. **Longest match**: Among non-deny rules, the most specific (longest) pattern wins

Example:
```yaml
paths:
  - path: /var/www/**
    access: write
  - path: /var/www/admin/**
    access: read
  - path: /var/www/admin/secrets/**
    access: none
```

After sorting:
1. `/var/www/admin/secrets/**` (deny, longest — evaluated first)
2. `/var/www/admin/**` (read, longer than `/var/www/**`)
3. `/var/www/**` (write, shortest — evaluated last)

## Pattern Matching

The `_path_matches()` method supports three glob syntaxes:

| Pattern | Matches | Example |
|---|---|---|
| Exact path | Only that path | `/etc/hosts` matches only `/etc/hosts` |
| `*` | Any single path component | `/var/log/*` matches `/var/log/syslog` but not `/var/log/nginx/error.log` |
| `**` | Zero or more path components | `/var/log/**` matches `/var/log/syslog`, `/var/log/nginx/`, `/var/log/nginx/error.log` |

Implementation:

```python
@staticmethod
def _path_matches(path: str, pattern: str) -> bool:
    # Exact match
    if "**" not in pattern and "*" not in pattern:
        return path == pattern or path.startswith(pattern + "/")

    # Convert glob to regex
    regex_pattern = pattern
    regex_pattern = regex_pattern.replace("**", "___DOUBLESTAR___")
    regex_pattern = regex_pattern.replace("*", "[^/]*")
    regex_pattern = regex_pattern.replace("___DOUBLESTAR___", ".*")

    return bool(re.match(f"^{regex_pattern}", path))
```

## Default Access

When no rule matches, the `default_access` from the config is used:

```yaml
permissions:
  default_access: none   # Safe default: deny everything unmatched
```

## Deny Override

Rules with `access: none` always take priority. This means you can:

1. Grant broad access: `/var/www/**` → `write`
2. Deny a specific subdirectory: `/var/www/admin/secrets/**` → `none`

The deny rule will match first because denies are sorted to the front, regardless of pattern length.

## Caching

The resolver maintains an LRU cache of recently resolved paths. The cache is invalidated on config reload. This avoids repeated glob matching for frequently accessed paths.
