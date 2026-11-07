"""Runs the AI service with uvicorn.

`python -m groundline_ai.server [--reload]`. Uses a selector event loop so psycopg's async
mode also works on Windows, where uvicorn defaults to the Proactor loop.
"""

import argparse
import os

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Groundline AI service")
    parser.add_argument("--host", default=os.environ.get("AI_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("AI_PORT", "8000")))
    parser.add_argument(
        "--reload", action="store_true", help="restart on code changes (development)"
    )
    args = parser.parse_args()
    uvicorn.run(
        "groundline_ai.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        loop="groundline_ai.aio:selector_loop",
    )


if __name__ == "__main__":
    main()
