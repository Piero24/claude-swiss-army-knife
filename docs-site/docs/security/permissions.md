# Permissions

All access is denied by default. You explicitly grant access via YAML configuration.

```yaml
permissions:
  default_access: none
  paths:
    - path: /var/log/**
      access: read
    - path: /var/www/**
      access: write
  commands:
    - pattern: "systemctl status *"
      access: read
    - pattern: "systemctl restart nginx"
      access: write
  default_command_access: none
```
