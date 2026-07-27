---
sidebar_position: 2
---

# Dashboard

The dashboard is the landing page after login. It gives you an overview of all MCP servers, their health status, and recent activity.

![Web UI Dashboard](/img/screenshots/dashboard.png)

## Server Cards

Each MCP server is displayed as a card with:

- **Icon and label**: Identifies the server (e.g., 🖥 Ubuntu Server)
- **Enable/Disable toggle**: Activate or deactivate the server. When deactivated, the server is unavailable to Claude Code and shows a warning banner on its detail page.
- **Path rules count**: Number of configured path permission rules
- **Command rules count**: Number of configured command permission rules
- **Config status**: Whether a valid YAML config is loaded
- **Health status**: Container health indicator (see below)

Click a server card to navigate to its detail page where you manage permissions.

## Health Status

Each server card shows a health indicator:

| Status | Color | Meaning |
|---|---|---|
| **Connected** | 🟢 Green | Container is running and has recent activity |
| **Idle** | 🟡 Yellow | Container is running but waiting for first request |
| **Unconfigured** | 🟠 Orange | Container is running but credentials appear to be defaults (check `.env`) |
| **Stopped** | 🔴 Red | Container is not running |
| **Error** | 🔴 Red | Container is running but health check failed |
| **Not found** | ⚫ Gray | Server configuration not found |

## Bulk Actions

The "Activate all" and "Deactivate all" buttons at the top let you enable or disable all MCP servers at once. This is useful for:

- **Maintenance mode**: Deactivate all servers before performing system updates
- **Quick recovery**: Activate all servers after maintenance
- **Troubleshooting**: Deactivate everything and reactivate one by one to isolate issues

## Stats Cards

The dashboard shows usage statistics via Recharts visualizations:

- **Requests over time**: Bar chart showing daily request volume
- **By server**: Distribution of requests across MCP servers
- **By user**: Which agents are making the most calls
- **Allow/Deny ratio**: Pie chart showing the ratio of allowed vs denied requests

## Status Legend

A legend at the bottom of the dashboard explains each health status color and reminds you that MCP servers communicate over stdio via SSH.

## Navigation

From the dashboard header, you can navigate to:

- **Agents** (🛡 icon): User management page
- **Settings** (⚙ icon): App configuration page
- **Logout**: End your session
