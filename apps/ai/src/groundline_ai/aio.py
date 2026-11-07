"""asyncio helpers.

psycopg's async mode can't run on Windows' default ProactorEventLoop, so command-line
entry points use a selector loop there. (Uvicorn already does this for the server.)
"""

import asyncio
import selectors
import sys
from collections.abc import Coroutine
from typing import Any


def run[T](coro: Coroutine[Any, Any, T]) -> T:
    if sys.platform == "win32":
        return asyncio.run(
            coro, loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector())
        )
    return asyncio.run(coro)
