"""Allow running as: python -m obsidian_mcp"""

from .server import main
import asyncio

asyncio.run(main())
