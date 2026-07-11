"""Allow running as: python -m ubuntu_mcp"""

from .server import main
import asyncio

asyncio.run(main())
