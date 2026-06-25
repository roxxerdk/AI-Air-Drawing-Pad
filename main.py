"""Small launcher that delegates to the `src` package."""

import argparse
import logging
from src import app

__version__ = "0.1.0"


def parse_args(argv=None):
    parser = argparse.ArgumentParser(prog="ai-air-drawing-pad")
    parser.add_argument("--version", action="store_true", help="show version and exit")
    parser.add_argument("--debug", action="store_true", help="enable debug logging")
    parser.add_argument("--no-headless", dest="headless", action="store_false", help="run with camera loop (not headless)")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.debug else logging.INFO)

    if args.version:
        print(__version__)
        return 0

    return app.run(headless=args.headless)


if __name__ == "__main__":
    raise SystemExit(main())
