"""Render app-icon.html with headless Chrome, then cut every Flutter launcher size.

Run from anywhere (needs Google Chrome + Pillow):

    python3 _developer/flutter/app-icon/source/generate.py

Output mirrors a Flutter project's layout, so `android/` and `ios/` can be
copied over the Flutter repo root as-is.
"""

import json
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HERE = Path(__file__).resolve().parent
OUT = HERE.parent
RES = OUT / "android/app/src/main/res"
IOS = OUT / "ios/Runner/Assets.xcassets/AppIcon.appiconset"

# Android density buckets: legacy icons are 48dp, adaptive layers are 108dp.
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

# Flutter's default iOS AppIcon set: (point size, scale, idiom).
IOS_ICONS = [
    (20, 2, "iphone"), (20, 3, "iphone"),
    (29, 1, "iphone"), (29, 2, "iphone"), (29, 3, "iphone"),
    (40, 2, "iphone"), (40, 3, "iphone"),
    (60, 2, "iphone"), (60, 3, "iphone"),
    (20, 1, "ipad"), (20, 2, "ipad"),
    (29, 1, "ipad"), (29, 2, "ipad"),
    (40, 1, "ipad"), (40, 2, "ipad"),
    (76, 1, "ipad"), (76, 2, "ipad"),
    (83.5, 2, "ipad"),
    (1024, 1, "ios-marketing"),
]

def render(variant: str, tmp: Path) -> Image.Image:
    path = tmp / f"{variant}.png"
    subprocess.run(
        [
            CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
            "--force-device-scale-factor=1", "--window-size=1024,1024",
            "--default-background-color=00000000", "--virtual-time-budget=1000",
            f"--screenshot={path}", f"file://{HERE / 'app-icon.html'}#{variant}",
        ],
        check=True,
        capture_output=True,
    )
    return Image.open(path).convert("RGBA")


def save(img: Image.Image, px: int, dest: Path, opaque: bool = False) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    out = img.resize((px, px), Image.LANCZOS)
    if opaque:  # App Store rejects icons with an alpha channel
        bg = Image.new("RGB", out.size, "#ffffff")
        bg.paste(out, mask=out.split()[3])
        out = bg
    out.save(dest, optimize=True)


def main() -> None:
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        ios, square, round_, fg = (render(v, tmp) for v in ("ios", "square", "round", "foreground"))

    # --- Android ---------------------------------------------------------
    for name, scale in DENSITIES.items():
        d = RES / f"mipmap-{name}"
        save(square, round(48 * scale), d / "ic_launcher.png")
        save(round_, round(48 * scale), d / "ic_launcher_round.png")
        save(fg, round(108 * scale), d / "ic_launcher_foreground.png")

    adaptive = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
"""
    anydpi = RES / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)
    (anydpi / "ic_launcher.xml").write_text(adaptive)
    (anydpi / "ic_launcher_round.xml").write_text(adaptive)
    values = RES / "values"
    values.mkdir(parents=True, exist_ok=True)
    (values / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        '    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n'
    )
    # Google Play listing icon: 512×512, full square (Play applies its own mask).
    save(ios, 512, OUT / "store/play-store-512.png", opaque=True)

    # --- iOS -------------------------------------------------------------
    images = []
    for pt, scale, idiom in IOS_ICONS:
        size = f"{pt:g}x{pt:g}"
        filename = f"Icon-App-{size}@{scale}x.png"
        save(ios, round(pt * scale), IOS / filename, opaque=True)
        images.append({"size": size, "idiom": idiom, "filename": filename, "scale": f"{scale}x"})
    (IOS / "Contents.json").write_text(
        json.dumps({"images": images, "info": {"version": 1, "author": "xcode"}}, indent=2) + "\n"
    )
    save(ios, 1024, OUT / "store/app-store-1024.png", opaque=True)


if __name__ == "__main__":
    main()
