#!/usr/bin/env python3
"""Package the module into dist/module.zip (+ dist/module.json).

Usage: python3 tools/build.py [version]
"""
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
INCLUDE = ["module.json", "LICENSE", "README.md", "scripts", "styles", "templates", "lang", "data"]


def main():
    manifest = json.loads((ROOT / "module.json").read_text(encoding="utf-8"))
    if len(sys.argv) > 1:
        manifest["version"] = sys.argv[1].lstrip("v")
    DIST.mkdir(exist_ok=True)
    manifest_text = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    (DIST / "module.json").write_text(manifest_text, encoding="utf-8")
    with zipfile.ZipFile(DIST / "module.zip", "w", zipfile.ZIP_DEFLATED) as zf:
        for entry in INCLUDE:
            path = ROOT / entry
            if entry == "module.json":
                zf.writestr("module.json", manifest_text)
            elif path.is_dir():
                for file in sorted(path.rglob("*")):
                    if file.is_file():
                        zf.write(file, file.relative_to(ROOT).as_posix())
            elif path.exists():
                zf.write(path, entry)
    print(f"Built {manifest['id']} v{manifest['version']} -> {DIST / 'module.zip'}")


if __name__ == "__main__":
    main()
