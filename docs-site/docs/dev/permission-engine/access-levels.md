---
sidebar_position: 2
---

# Access Levels

The `AccessLevel` enum defines the access control hierarchy used throughout the permission engine.

## Enum Definition

```python
class AccessLevel(str, Enum):
    NONE = "none"
    READ = "read"
    WRITE = "write"
    ACTIVE = "active"

    def grants(self, required: "AccessLevel") -> bool:
        order = {
            AccessLevel.NONE: 0,
            AccessLevel.READ: 1,
            AccessLevel.WRITE: 2,
            AccessLevel.ACTIVE: 1,
        }
        return order[self] >= order[required]
```

## Hierarchy

```
WRITE (2) ─── implies READ
  │
READ (1) ──── implies ACTIVE (only in command/tool context)
  │
NONE (0) ──── explicit deny, overrides everything
```

### For Paths

| Access | Permissions |
|---|---|
| `none` | Cannot access the path at all |
| `read` | Can list directories, read file contents |
| `write` | Can create, update, delete files (implies `read`) |

### For Commands

| Access | Permissions |
|---|---|
| `none` | Command cannot be executed |
| `active` | Command can be executed |

### For Tools (Proxy Servers)

| Access | Permissions |
|---|---|
| `none` | Tool cannot be used |
| `active` | Tool can be used |

## The grants() Method

The `grants()` method checks if one access level is sufficient to satisfy a required level:

```python
AccessLevel.WRITE.grants(AccessLevel.READ)   # True  (write implies read)
AccessLevel.READ.grants(AccessLevel.WRITE)    # False (read does not imply write)
AccessLevel.READ.grants(AccessLevel.NONE)     # True  (anything grants none)
AccessLevel.NONE.grants(AccessLevel.READ)     # False (none grants nothing)
```

This is used in the `check()` method:

```python
def check(self, required_access, path, tool=""):
    required = AccessLevel(required_access)
    granted = self._path_resolver.resolve(path)

    if not granted.grants(required):
        raise ForbiddenError(...)
```

## How ACTIVE Relates

`ACTIVE` is at the same numeric level as `READ` (1) in the hierarchy. It is used for binary on/off access for commands and tools where there is no concept of "read vs write":

```python
AccessLevel.ACTIVE.grants(AccessLevel.ACTIVE)  # True
AccessLevel.ACTIVE.grants(AccessLevel.NONE)    # True
AccessLevel.NONE.grants(AccessLevel.ACTIVE)    # False
```

Commands and tools always require `ACTIVE` access, which means any rule with `access: active` satisfies the requirement.
