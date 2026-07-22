#!/usr/bin/env python3
"""Inventory Astral's proprietary FNT files without pretending to decode them."""

import hashlib
import json
import sys
from pathlib import Path


def pascal_string(data: bytes, offset: int = 0) -> str | None:
    if offset >= len(data):
        return None
    length = data[offset]
    end = offset + 1 + length
    if not 1 <= length <= 40 or end > len(data):
        return None
    raw = data[offset + 1 : end]
    if any(byte < 32 or byte > 126 for byte in raw):
        return None
    return raw.decode("ascii")


def inspect(path: Path) -> dict:
    data = path.read_bytes()
    magic_family = data.startswith(bytes.fromhex("c00150f7"))
    name_offset = 4 if magic_family else 0
    return {
        "file": path.name,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "formatFamily": "magic-c00150f7" if magic_family else "pascal-name-header",
        "embeddedName": pascal_string(data, name_offset),
        "headerHex64": data[:64].hex(),
        "decodeStatus": "proprietary_format_not_decoded",
    }


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: inspect_astral_fonts.py FONT_DIR OUTPUT_JSON", file=sys.stderr)
        return 2
    font_dir, output = Path(sys.argv[1]), Path(sys.argv[2])
    paths = sorted(
        (path for path in font_dir.iterdir() if path.is_file() and path.suffix.lower() == ".fnt"),
        key=lambda path: path.name.lower(),
    )
    report = {
        "scope": str(font_dir),
        "fontCount": len(paths),
        "caution": "Header fields are inventoried only; glyph encoding remains undecoded.",
        "fonts": [inspect(path) for path in paths],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"inspected={len(paths)} output={output}")
    return 0 if paths else 1


if __name__ == "__main__":
    raise SystemExit(main())
