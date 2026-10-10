"""Car pictures for the Cars pages (user's request, 2026-10-08): ACC screenshots only (the user's choice,
no commercial pictures).

  python tools/car_images/process.py <car key> --side shot.png [--source showroom|aero]
  python tools/car_images/process.py --batch <folder> --order <file>     many cars at once

--side: a side-on screenshot of the car, nose to the right:
        showroom (default): the game's Showroom, car on the turntable filling the width (the user's
                  2026-10-09 set, 1920 x 1200);
        aero:     the setup screen's Aero tab, taken before the coloured airflow lines appear.
        The car is found with GrabCut (on a third of the size: full size took minutes), then the
        picture is cropped around it with faded edges and the surroundings darkened a little: a hard
        cut-out was tried and dropped (the cars are dark grey on a dark grey showroom: it lost rear
        wings and kept patches of wall and floor; a median "empty showroom" of all shots failed too,
        the cars overlap too much). Saved as web/public/media/cars/side/<car>.webp (600 px wide).
--batch/--order: every .png of the folder sorted by name, matched line by line with the car keys of
        the order file (one key per line), all as --side.
Then web/lib/car-images.json says which pictures exist (with a version for the browser cache).
The car page's big transparent cut-outs come from cutout.py (same screenshots), which since 2026-10-10
also writes the table's side views (number plate painted over): use it, this script is the old way.
Needs opencv-python-headless and numpy (CV_PATH: a folder they are installed in, if not in the venv).
"""
import argparse, json, os, sys, time
if os.environ.get("CV_PATH"): sys.path.insert(0, os.environ["CV_PATH"])
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB = os.path.join(ROOT, "web")
MANIFEST = os.path.join(WEB, "lib", "car-images.json")
# Where the car can be, as fractions of the screenshot (left, top, right, bottom), and the part that
# is surely the car (its doors)
BOXES = {
    "showroom": ((0.003, 0.10, 0.997, 0.78), (0.25, 0.40, 0.75, 0.58)),
    "aero": ((0.06, 0.50, 0.66, 0.762), (0.20, 0.59, 0.50, 0.69)),   # above the "Front aero variation" box
}


def find_car(img, source: str):
    """Bounding box (x, y, w, h) of the car, found by GrabCut on a third of the size."""
    h, w = img.shape[:2]
    s = 3
    small = cv2.resize(img, (w // s, h // s), interpolation=cv2.INTER_AREA)
    sh, sw = small.shape[:2]
    (l, t, r, b), (fl, ft, fr, fb) = BOXES[source]
    mask = np.full((sh, sw), cv2.GC_BGD, np.uint8)
    mask[int(t * sh):int(b * sh), int(l * sw):int(r * sw)] = cv2.GC_PR_FGD
    mask[int(ft * sh):int(fb * sh), int(fl * sw):int(fr * sw)] = cv2.GC_FGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(small, mask, None, bgd, fgd, 5, cv2.GC_INIT_WITH_MASK)
    car = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    car = cv2.morphologyEx(car, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(car)
    k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    car = np.where(lab == k, 255, 0).astype(np.uint8)
    x, y, bw, bh = cv2.boundingRect(car)
    return x * s, y * s, bw * s, bh * s, cv2.resize(car, (w, h), interpolation=cv2.INTER_LINEAR)


def side_view(path: str, out: str, source: str, flip: bool):
    img = cv2.imread(path)
    if img is None: raise SystemExit(f"cannot read {path}")
    h, w = img.shape[:2]
    x, y, bw, bh, car = find_car(img, source)
    px, py = int(0.02 * bw), int(0.06 * bh)
    x, y = max(0, x - px), max(0, y - py)
    bw, bh = min(w - x, bw + 2 * px), min(h - y, bh + 2 * py)
    # GrabCut sometimes takes the floor or the turntable's ring too: a side view is never taller than
    # 0.34 × its length (wing included), so the extra is cut from the bottom
    bh = min(bh, int(0.34 * bw))
    crop = img[y:y + bh, x:x + bw]
    # Faded edges: left and right, the top, gently at the bottom so the tyres stay
    fx, fy = np.ones(bw, np.float32), np.ones(bh, np.float32)
    ex, ey = int(0.07 * bw), int(0.20 * bh)
    fx[:ex] = np.linspace(0, 1, ex); fx[-ex:] = np.linspace(1, 0, ex)
    fy[:ey] = np.linspace(0, 1, ey); fy[-(ey // 3):] = np.linspace(1, 0, ey // 3)
    fade = np.outer(fy, fx)
    # The surroundings darkened a little, so the car reads first
    soft = cv2.GaussianBlur(car[y:y + bh, x:x + bw], (41, 41), 0).astype(np.float32) / 255
    rgb = (crop.astype(np.float32) * (0.5 + 0.5 * soft[..., None])).clip(0, 255).astype(np.uint8)
    rgba = np.dstack([rgb, (255 * fade).astype(np.uint8)])
    if flip: rgba = cv2.flip(rgba, 1)
    rgba = cv2.resize(rgba, (600, int(round(bh * 600 / bw))), interpolation=cv2.INTER_AREA)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cv2.imwrite(out, rgba, [cv2.IMWRITE_WEBP_QUALITY, 86])
    return rgba.shape


def main():
    p = argparse.ArgumentParser(description="Car pictures from ACC screenshots")
    p.add_argument("car", nargs="?", help="ACC car key, e.g. ford_mustang_gt3 (web/lib/cars.ts)")
    p.add_argument("--side", help="side-on screenshot of the car")
    p.add_argument("--source", choices=sorted(BOXES), default="showroom", help="where the side shot comes from")
    p.add_argument("--flip", action="store_true", help="mirror the side view (nose must point right)")
    p.add_argument("--batch", help="folder of side shots (sorted by name), with --order")
    p.add_argument("--order", help="file with one car key per line, in the folder's order")
    a = p.parse_args()
    manifest = json.load(open(MANIFEST, encoding="utf-8")) if os.path.exists(MANIFEST) else {}
    v = int(time.time())
    jobs = []
    if a.batch:
        files = sorted(f for f in os.listdir(a.batch) if f.lower().endswith(".png"))
        keys = [k.strip() for k in open(a.order, encoding="utf-8") if k.strip()]
        if len(files) != len(keys): raise SystemExit(f"{len(files)} pictures but {len(keys)} cars")
        jobs = [(k, os.path.join(a.batch, f)) for k, f in zip(keys, files)]
    elif a.car and a.side:
        jobs = [(a.car, a.side)]
    else:
        p.error("give a car key and --side, or --batch")
    for car, side in jobs:
        entry = manifest.get(car, {})
        shape = side_view(side, os.path.join(WEB, "public", "media", "cars", "side", f"{car}.webp"), a.source, a.flip)
        entry["side"] = v; print(f"{car}: side view {shape[1]} x {shape[0]}")
        manifest[car] = entry
    with open(MANIFEST, "w", encoding="utf-8") as f: json.dump(dict(sorted(manifest.items())), f, indent=1); f.write("\n")


if __name__ == "__main__":
    main()
