#!/usr/bin/env python3
"""Serve the module for dev/harness.html without browser caching."""
import functools
import http.server
import re
from pathlib import Path


class NoCache(http.server.SimpleHTTPRequestHandler):
    """No-store headers, and `/v<n>/…` aliases the root so each harness load gets fresh module URLs."""

    def translate_path(self, path):
        return super().translate_path(re.sub(r"^/v\d+/", "/", path))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    handler = functools.partial(NoCache, directory=str(root))
    http.server.ThreadingHTTPServer(("127.0.0.1", 8765), handler).serve_forever()
