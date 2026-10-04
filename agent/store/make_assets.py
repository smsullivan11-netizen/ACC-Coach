"""Store package images (Start menu, taskbar, Store logo) from the app icon, at the sizes Windows asks
for. File names carry the scale/size; resources.pri (makepri) maps them to the names in the manifest.

python agent/store/make_assets.py <output folder>
"""
import sys
from pathlib import Path

sys.path[:0] = [str(Path(__file__).resolve().parent.parent), str(Path(__file__).resolve().parents[2])]
from acc_coach_app import make_icon

SCALES = {100: 1, 125: 1.25, 150: 1.5, 200: 2, 400: 4}
TARGET_SIZES = (16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256)


def main(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    for name, base in (("Square44x44Logo", 44), ("Square150x150Logo", 150), ("StoreLogo", 50)):
        for scale, k in SCALES.items():
            make_icon(round(base * k)).save(out / f"{name}.scale-{scale}.png")
    for size in TARGET_SIZES:                      # taskbar and Start list: no coloured plate behind
        img = make_icon(size)
        img.save(out / f"Square44x44Logo.targetsize-{size}.png")
        img.save(out / f"Square44x44Logo.targetsize-{size}_altform-unplated.png")
        img.save(out / f"Square44x44Logo.targetsize-{size}_altform-lightunplated.png")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
