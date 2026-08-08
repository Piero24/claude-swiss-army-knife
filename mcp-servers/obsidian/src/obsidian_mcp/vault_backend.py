"""Vault backend — local filesystem access."""

from pathlib import Path

from .vault import Vault


class LocalVaultBackend:
    """Direct filesystem access — wraps the existing Vault class.

    TODO(refactor): collapse LocalVaultBackend into Vault directly — single backend.
    """

    def __init__(self, vault_path: str):
        self._vault = Vault(vault_path)

    @property
    def root(self) -> Path:
        return self._vault.root

    async def read_note(self, relative_path: str) -> str:
        return self._vault.read_note(relative_path)

    async def write_note(self, relative_path: str, content: str) -> Path:
        return self._vault.write_note(relative_path, content)

    async def delete_note(
        self, relative_path: str, permanent: bool = False
    ) -> dict:
        return self._vault.delete_note(relative_path, permanent)

    async def list_vault(
        self, subfolder: str = "", depth: int = 3
    ) -> list[dict]:
        return self._vault.list_vault(subfolder, depth)

    async def note_exists(self, relative_path: str) -> bool:
        return self._vault.note_exists(relative_path)

    async def get_all_notes(self) -> list[Path]:
        return self._vault.get_all_notes()


def create_backend(config: dict | None = None) -> LocalVaultBackend:
    """Create the vault backend. Always uses /data/vaults (container mount point)."""
    return LocalVaultBackend("/data/vaults")
