"""Allow running as: python -m obsidian_mcp [discover]"""

import sys

if len(sys.argv) > 1 and sys.argv[1] == "discover":
    sys.argv.pop(1)  # Remove 'discover' subcommand
    from .discover import main as discover_main
    discover_main()
else:
    from .server import main
    import asyncio
    asyncio.run(main())
