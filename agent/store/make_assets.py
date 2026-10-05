"""Store package images (Start menu, taskbar, Store logo) from the team logo, at the sizes Windows asks
for. File names carry the scale/size; resources.pri (makepri) maps them to the names in the manifest.
With --listing, also the images to upload on the Store listing page in Partner Center.

python agent/store/make_assets.py <output folder> [--listing <folder>]
"""
import sys
from pathlib import Path

sys.path[:0] = [str(Path(__file__).resolve().parent)]
from logo import make_logo, make_poster

SCALES = {100: 1, 125: 1.25, 150: 1.5, 200: 2, 400: 4}
TARGET_SIZES = (16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256)


def main(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    for name, base in (("Square44x44Logo", 44), ("Square150x150Logo", 150), ("StoreLogo", 50)):
        for scale, k in SCALES.items():
            make_logo(round(base * k)).save(out / f"{name}.scale-{scale}.png")
    for size in TARGET_SIZES:                      # taskbar and Start list: no coloured plate behind
        img = make_logo(size, rounded=True)
        img.save(out / f"Square44x44Logo.targetsize-{size}.png")
        img.save(out / f"Square44x44Logo.targetsize-{size}_altform-unplated.png")
        img.save(out / f"Square44x44Logo.targetsize-{size}_altform-lightunplated.png")


def listing(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    for size in (2160, 1080, 300, 71):
        make_logo(size).convert("RGB").save(out / f"ACC-Coach-logo-{size}.png")
    make_poster().convert("RGB").save(out / "ACC-Coach-poster-1440x2160.png")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
    if "--listing" in sys.argv:
        listing(Path(sys.argv[sys.argv.index("--listing") + 1]))
