---
sidebar_position: 4
---

# Agent Management

The Agents page manages who can use the MCP servers and what they can access. You can add users, generate API keys, set access modes, and restrict tools per user.

![Agents Page](/img/screenshots/agents.png)

## Access Modes

Choose how users are authenticated and authorized:

| Mode | Behavior | Use Case |
|---|---|---|
| **Open** | Everyone can use tools. Disable specific users. | Trusted network, single user |
| **Allowlist** | Only listed users can use tools. Others are denied. | Multi-user, least privilege |
| **Blocklist** | Everyone except blocked users can use tools. | Most users trusted, few blocked |

The current mode is highlighted. Click any mode to switch. Changes take effect after clicking "Save".

### Open Mode

```yaml
mode: open
users:
  - id: "alice"
    key: "sha256$..."
    name: "Alice"
    enabled: true
    tools: ["*"]
  - id: "bob"
    key: "sha256$..."
    name: "Bob"
    enabled: false   # Bob is explicitly disabled
    tools: ["*"]
```

### Allowlist Mode

```yaml
mode: allowlist
users:
  - id: "alice"
    enabled: true
    tools: ["ubuntu_read_file", "ubuntu_system_info", "ubuntu_list_dir"]
```

Only Alice can use MCP tools, and only the three listed tools. All other users and tools are denied.

### Blocklist Mode

```yaml
mode: blocklist
users:
  - id: "bob"
    enabled: false   # Bob is blocked, everyone else is allowed
    tools: ["*"]
```

## User Table

Each row in the user table shows:

| Column | Description |
|---|---|
| **Name** | Display name for the user |
| **ID** | Unique identifier used in `MCP_USER_ID` env var |
| **Tools** | Comma-separated list of allowed tools (editable inline). Use `*` for all tools. |
| **Key** | Whether a key is set (hashed) or not |
| **Last seen** | Time since last MCP request from this user |
| **Status** | Enable/disable toggle |
| **Remove** | Delete the user |

## Adding a User

Click "Add" to open the user creation form:

1. **ID**: Unique identifier (e.g., `alice`). This is what you set in `MCP_USER_ID`.
2. **Name**: Display name (e.g., `Alice`). Defaults to ID if left empty.
3. **Key**: SHA-256 hashed key. Use the "Generate" button or paste a pre-hashed value.

### Key Generation

Click "Generate" to create a new key:

1. A 32-character random secret is generated in the browser
2. A 16-byte random salt is generated
3. The key is stored as `sha256$<salt>$<hash>` where hash = SHA-256(salt + secret)
4. The **plaintext secret is shown once** in a yellow banner — copy it immediately

:::danger
The plaintext secret is never stored and cannot be recovered. If lost, generate a new key.
:::

The generated secret is what you set in `MCP_USER_KEY` in Claude Code's `settings.json`:

```json
{
  "mcpServers": {
    "ubuntu-server": {
      "command": "ssh",
      "args": [
        "my-server",
        "docker", "exec", "-i",
        "-e", "MCP_USER_ID=alice",
        "-e", "MCP_USER_KEY=<COPIED-SECRET>",
        "ubuntu-mcp",
        "python", "-m", "ubuntu_mcp"
      ]
    }
  }
}
```

## Tool Restrictions

The "Tools" column in the user table accepts comma-separated MCP tool names. Click on a tools cell to edit it inline:

- `*` — All tools allowed (default)
- `ubuntu_read_file, ubuntu_system_info` — Only these specific tools
- Press Enter or click away to save

Tool restrictions are evaluated after authentication. A user might authenticate successfully but be denied access to specific tools they try to use.

## Saving Changes

User management changes are **not persisted until you click "Save"**. The save button appears at the top of the page. Until saved, changes exist only in the browser session.

The "Save" button writes the entire users configuration to `configs/users.yaml`, which is immediately picked up by all MCP servers via hot reload.

## Removing Users

Click the X icon on any user row to remove them. Like all changes, this takes effect after clicking "Save".

Removing a user from allowlist mode immediately blocks their access. Removing a user from blocklist or open mode has no effect if they were enabled — they revert to the default access for the mode.
