"""Allow running as: python -m synology_mcp [discover]"""

import logging
import os
import sys

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

if len(sys.argv) > 1 and sys.argv[1] == "discover":
    sys.argv.pop(1)
    from .discover import main as discover_main

    discover_main()
else:
    from .server import main
    import asyncio

    asyncio.run(main())
