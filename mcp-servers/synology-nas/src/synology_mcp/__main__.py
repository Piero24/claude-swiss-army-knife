"""Allow running as: python -m synology_mcp"""

from .server import main
import asyncio

asyncio.run(main())
