#!/usr/bin/env python3
"""Build a labeled contact sheet from the verified original Astral portraits."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "references/astral-extracted/Astral_Tournament_Original_Asset_Extraction/converted/faces-png"
OUTPUT = ROOT / "qa/face-catalog.png"


def face_number(path: Path) -> int:
    return int("".join(character for character in path.stem if character.isdigit()))


def main() -> None:
    paths = sorted(SOURCE.glob("*.png"), key=face_number)
    if len(paths) != 32:
        raise SystemExit(f"Expected 32 portraits, found {len(paths)}")

    columns = 8
    cell_width, cell_height = 148, 166
    sheet = Image.new("RGB", (columns * cell_width, 4 * cell_height), "#080b1d")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=16)

    for index, path in enumerate(paths):
        x = (index % columns) * cell_width
        y = (index // columns) * cell_height
        portrait = Image.open(path).convert("RGB").resize((120, 120), Image.Resampling.NEAREST)
        sheet.paste(portrait, (x + 14, y + 10))
        draw.rectangle((x + 13, y + 9, x + 134, y + 130), outline="#d6b44f", width=2)
        label = path.stem
        label_box = draw.textbbox((0, 0), label, font=font)
        label_width = label_box[2] - label_box[0]
        draw.text((x + (cell_width - label_width) / 2, y + 137), label, fill="#f5e7a0", font=font)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT, optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
