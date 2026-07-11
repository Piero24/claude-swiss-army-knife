"""Translates host paths to container mount paths.

The Ubuntu MCP container mounts host directories under /mnt/host/.
This module transparently translates user-facing host paths to the
actual mounted paths inside the container.
"""

import os
from pathlib import Path


class PathMapper:
    """Maps host filesystem paths to their container mount equivalents.

    Host paths are mounted under /mnt/host/ inside the container.
    E.g., /var/www/html → /mnt/host/var/www/html
    """

    def __init__(self, mount_prefix: str = "/mnt/host"):
        self._mount_prefix = Path(mount_prefix)

    def host_to_container(self, host_path: str) -> Path:
        """Convert a host path to the container mount path.

        Args:
            host_path: Absolute path on the host (e.g., /var/www/index.html).

        Returns:
            Absolute path inside the container (e.g., /mnt/host/var/www/index.html).
        """
        clean = host_path.lstrip("/")
        return (self._mount_prefix / clean).resolve(strict=False)

    def container_to_host(self, container_path: str | Path) -> str:
        """Convert a container mount path back to the host path.

        Args:
            container_path: Path inside the container.

        Returns:
            Host path as string.
        """
        cp = Path(container_path)
        try:
            rel = cp.relative_to(self._mount_prefix)
            return "/" + str(rel)
        except ValueError:
            return str(cp)

    def get_available_mounts(self) -> list[str]:
        """List which host paths are available inside the container.

        Returns:
            List of directory names mounted under the prefix.
        """
        if not self._mount_prefix.exists():
            return []
        return [
            d.name
            for d in self._mount_prefix.iterdir()
            if d.is_dir() or d.is_symlink()
        ]
