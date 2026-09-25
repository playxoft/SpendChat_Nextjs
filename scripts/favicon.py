"""Render src/app/icon.svg into the raster icons Next serves from `app/`.

Run from the repo root after changing the mark (needs Google Chrome + Pillow):

    python3 scripts/favicon.py

Writes:
- src/app/favicon.ico   — 16/32/48 px. This is the one Google Search shows, so
                          keep the white background (dark mode would hide a
                          transparent black mark) and the padding (Google crops
                          it to a circle).
- src/app/apple-icon.png — 180 px, opaque, for iOS home-screen bookmarks.
"""

import re
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
APP = Path(__file__).resolve().parent.parent / "src/app"


def main() -> None:
    svg = (APP / "icon.svg").read_text()
    # A raster can't follow the browser theme — pin the light-mode colors.
    svg = re.sub(
        r"<style>.*?</style>",
        "<style>.bubble{stroke:#0a0a0a}.symbol{fill:#0a0a0a}</style>",
        svg,
        flags=re.S,
    )
    # Widen the 24-unit viewBox by 1 unit a side so the bubble clears the circle.
    svg = svg.replace('viewBox="0 0 24 24"', 'viewBox="-1 -1 26 26" width="1024" height="1024"')

    with tempfile.TemporaryDirectory() as t:
        html, png = Path(t) / "icon.html", Path(t) / "icon.png"
        html.write_text(f'<html><body style="margin:0;background:#fff">{svg}</body></html>')
        subprocess.run(
            [
                CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                "--force-device-scale-factor=1", "--window-size=1024,1024",
                "--virtual-time-budget=1000", f"--screenshot={png}", f"file://{html}",
            ],
            check=True,
            capture_output=True,
        )
        img = Image.open(png).convert("RGB")

    img.save(APP / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    img.resize((180, 180), Image.LANCZOS).save(APP / "apple-icon.png", optimize=True)


if __name__ == "__main__":
    main()
