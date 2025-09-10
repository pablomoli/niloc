"""
Generate PWA icons from the existing logo.

Sources:
- Input:  static/data/EMS-llc-4.png
- Output: static/icons/icon-<size>.png for sizes [120, 152, 167, 180, 192, 512]

Usage:
  python python_scripts/generate_pwa_icons.py

Notes:
- Prefers Pillow if installed. If not, attempts to use ImageMagick `convert`.
- Ensure output directory `static/icons/` exists or let this script create it.
"""

from pathlib import Path
import subprocess
import sys

SIZES = [120, 152, 167, 180, 192, 512]
ROOT = Path(__file__).resolve().parent.parent
INPUT = ROOT / "static" / "data" / "EMS-llc-4.png"
OUTDIR = ROOT / "static" / "icons"


def ensure_outdir() -> None:
    OUTDIR.mkdir(parents=True, exist_ok=True)


def with_pillow() -> bool:
    try:
        from PIL import Image  # type: ignore
    except Exception:
        return False
    img = Image.open(INPUT).convert("RGBA")
    for size in SIZES:
        out = OUTDIR / f"icon-{size}.png"
        img.resize((size, size), Image.LANCZOS).save(out)
        print(f"Wrote {out}")
    return True


def with_imagemagick() -> bool:
    try:
        subprocess.run(["convert", "-version"], capture_output=True, check=True)
    except Exception:
        return False
    for size in SIZES:
        out = OUTDIR / f"icon-{size}.png"
        cmd = [
            "convert",
            str(INPUT),
            "-resize",
            f"{size}x{size}",
            str(out),
        ]
        subprocess.run(cmd, check=True)
        print(f"Wrote {out}")
    return True


def main() -> int:
    if not INPUT.exists():
        print(f"Input logo not found: {INPUT}", file=sys.stderr)
        return 1
    ensure_outdir()
    if with_pillow():
        return 0
    if with_imagemagick():
        return 0
    print("Neither Pillow nor ImageMagick available. Install Pillow: pip install Pillow", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

