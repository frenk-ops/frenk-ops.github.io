#!/usr/bin/env python3
"""Inventario locale per vecchie installazioni di Astral Tournament.

Uso:
    python tools/legacy_scanner.py /percorso/cartella
    python tools/legacy_scanner.py archivio.zip

Produce un JSON con estensioni, file candidati, hash e stringhe testuali utili.
Non modifica né estrae definitivamente i file analizzati.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from typing import Iterable, Iterator, Tuple

KEYWORDS = re.compile(
    rb"(?i)(astral|card|creature|spell|tournament|rank|trophy|difficulty|novice|master|mana|power|profile|save|fire|water|air|earth|death)"
)
TEXT_EXTENSIONS = {".txt", ".ini", ".cfg", ".xml", ".json", ".csv", ".log", ".res"}
CANDIDATE_NAME = re.compile(
    r"(?i)(card|creature|spell|tournament|rank|trophy|ai|difficulty|astral|mana|power|save|profile|sound|music|image|sprite)"
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def iter_folder(root: Path) -> Iterator[Tuple[str, bytes]]:
    for path in sorted(root.rglob("*")):
        if path.is_file():
            try:
                yield str(path.relative_to(root)), path.read_bytes()
            except OSError as exc:
                print(f"Avviso: impossibile leggere {path}: {exc}", file=sys.stderr)


def iter_zip(path: Path) -> Iterator[Tuple[str, bytes]]:
    with zipfile.ZipFile(path) as archive:
        for info in sorted(archive.infolist(), key=lambda item: item.filename.lower()):
            if info.is_dir():
                continue
            try:
                yield info.filename, archive.read(info)
            except (OSError, zipfile.BadZipFile) as exc:
                print(f"Avviso: impossibile leggere {info.filename}: {exc}", file=sys.stderr)


def extract_samples(data: bytes, limit: int = 8) -> list[str]:
    samples: list[str] = []
    for match in KEYWORDS.finditer(data[:4_000_000]):
        start = max(0, match.start() - 55)
        end = min(len(data), match.end() + 85)
        chunk = data[start:end].replace(b"\x00", b" ")
        text = chunk.decode("utf-8", errors="ignore")
        text = re.sub(r"\s+", " ", text).strip()
        if text and text not in samples:
            samples.append(text)
        if len(samples) >= limit:
            break
    return samples


def scan(source: Path) -> dict:
    iterator: Iterable[Tuple[str, bytes]]
    if source.is_dir():
        iterator = iter_folder(source)
        source_type = "folder"
    elif source.is_file() and zipfile.is_zipfile(source):
        iterator = iter_zip(source)
        source_type = "zip"
    else:
        raise ValueError("Il percorso deve essere una cartella o un archivio ZIP valido.")

    extensions: Counter[str] = Counter()
    files = []
    candidates = []
    text_hits = []
    total_bytes = 0

    for relative_name, data in iterator:
        suffix = Path(relative_name).suffix.lower() or "<none>"
        extensions[suffix] += 1
        total_bytes += len(data)
        record = {
            "path": relative_name,
            "size": len(data),
            "extension": suffix,
            "sha256": sha256(data),
        }
        files.append(record)
        if CANDIDATE_NAME.search(relative_name):
            candidates.append(record)
        if suffix in TEXT_EXTENSIONS or KEYWORDS.search(data[:2_000_000]):
            samples = extract_samples(data)
            if samples:
                text_hits.append({"path": relative_name, "samples": samples})

    return {
        "source": str(source),
        "sourceType": source_type,
        "fileCount": len(files),
        "totalBytes": total_bytes,
        "extensions": dict(extensions.most_common()),
        "candidateFiles": candidates,
        "textHits": text_hits,
        "files": files,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Cartella o file ZIP da analizzare")
    parser.add_argument("--output", "-o", type=Path, help="File JSON di destinazione")
    args = parser.parse_args()

    try:
        result = scan(args.source.expanduser().resolve())
    except (ValueError, OSError, zipfile.BadZipFile) as exc:
        parser.error(str(exc))
        return 2

    output = args.output or Path("legacy_scan_report.json")
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Analizzati {result['fileCount']} file ({result['totalBytes']} byte).")
    print(f"Report: {output.resolve()}")
    print(f"File candidati: {len(result['candidateFiles'])}; file con stringhe utili: {len(result['textHits'])}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
