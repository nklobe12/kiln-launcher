#!/usr/bin/env python3
"""Builds web/dist/index.html (one self-contained file) from web/src.

The iOS and Android apps bundle web/dist into the app. If the
CURSEFORGE_API_KEY environment variable is set, it is written to
dist/kiln-config.json so the apps start with a working key.
"""
import json
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

JS_ORDER = [
    "util.js",
    "icons.js",
    "native.js",
    "curseforge.js",
    "zip.js",
    "store.js",
    "install.js",
    "ui.js",
    "views-browse.js",
    "views-profiles.js",
    "views-other.js",
    "app.js",
]


def main() -> None:
    template = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    js_parts = []
    for name in JS_ORDER:
        js_parts.append(f"// ---- {name} ----\n" + (SRC / name).read_text(encoding="utf-8"))
    js = "(() => {\n'use strict';\n" + "\n".join(js_parts) + "\n})();\n"
    html = template.replace("/*__STYLE__*/", css).replace("/*__SCRIPT__*/", js)
    DIST.mkdir(exist_ok=True)
    (DIST / "index.html").write_text(html, encoding="utf-8")
    config = {"curseforgeApiKey": os.environ.get("CURSEFORGE_API_KEY", "").strip()}
    (DIST / "kiln-config.json").write_text(json.dumps(config), encoding="utf-8")
    print(f"wrote {DIST / 'index.html'} ({len(html) // 1024} KB)")


if __name__ == "__main__":
    main()
