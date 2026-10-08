"""Car pictures for the Cars pages (user's request, 2026-10-08): ACC screenshots only (the user's choice,
no commercial pictures).

  python tools/car_images/process.py <car key> --side aero_tab.png [--bg nice_shot.png]

--side: a screenshot of the game's setup screen, Aero tab: every car is shown there side-on, nose to
        the right, at the same place and scale. The car is cut out of the darkened background
        (GrabCut inside the box where the game draws it, for the crop), its edges faded out, saved as:
        web/public/media/cars/side/<car>.webp (600 px wide).
--bg:   any good in-game shot of the car, cropped to 12:5 and saved as the car page's background:
        web/public/media/cars/bg/<car>.webp (1920 x 800).
Then web/lib/car-images.json says which pictures exist (with a version for the browser cache).
Needs opencv-python-headless and numpy (CV_PATH: a folder they are installed in, if not in the venv).
"""
import argparse, json, os, sys, time
if os.environ.get("CV_PATH"): sys.path.insert(0, os.environ["CV_PATH"])
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB = os.path.join(ROOT, "web")
MANIFEST = os.path.join(WEB, "lib", "car-images.json")
# Where the Aero tab draws the car, as fractions of the screenshot (checked at 1920 x 1200, ACC 1.10.4)
CAR_BOX = (0.06, 0.50, 0.66, 0.762)   # left, top, right, bottom (above the "Front aero variation" box)


def cut_side(path: str, out: str, flip: bool):
    img = cv2.imread(path)
    if img is None: raise SystemExit(f"cannot read {path}")
    h, w = img.shape[:2]
    l, t, r, b = (int(CAR_BOX[0] * w), int(CAR_BOX[1] * h), int(CAR_BOX[2] * w), int(CAR_BOX[3] * h))
    mask = np.full((h, w), cv2.GC_BGD, np.uint8)
    mask[t:b, l:r] = cv2.GC_PR_FGD
    # Surely the car: the band between the wheels
    cy, cx = (t + b) // 2, (l + r) // 2
    mask[cy - int(0.04 * h): cy + int(0.06 * h), cx - int(0.14 * w): cx + int(0.14 * w)] = cv2.GC_FGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    car = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    car = cv2.morphologyEx(car, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    car = cv2.morphologyEx(car, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(car)
    k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    car = np.where(lab == k, 255, 0).astype(np.uint8)
    x, y, bw, bh = cv2.boundingRect(car)
    # The setup screen's cars are dark grey on a dark, blurred scene: a hard cut-out keeps patches of
    # it. Instead a tight crop whose edges fade out (the site is dark too), the scene darkened a little.
    px, py = int(0.02 * bw), int(0.06 * bh)
    x, y = max(0, x - px), max(0, y - py)
    bw, bh = min(w - x, bw + 2 * px), min(h - y, bh + 2 * py)
    crop = img[y:y + bh, x:x + bw]
    fx, fy = np.ones(bw, np.float32), np.ones(bh, np.float32)
    ex, ey = int(0.08 * bw), int(0.22 * bh)
    fx[:ex] = np.linspace(0, 1, ex); fx[-ex:] = np.linspace(1, 0, ex)
    fy[:ey] = np.linspace(0, 1, ey); fy[-(ey // 3):] = np.linspace(1, 0, ey // 3)   # gentle at the bottom: the tyres stay
    fade = np.outer(fy, fx)
    soft = cv2.GaussianBlur(car[y:y + bh, x:x + bw], (31, 31), 0).astype(np.float32) / 255
    rgb = (crop.astype(np.float32) * (0.55 + 0.45 * soft[..., None])).astype(np.uint8)
    rgba = np.dstack([rgb, (255 * fade).astype(np.uint8)])
    if flip: rgba = cv2.flip(rgba, 1)
    rgba = cv2.resize(rgba, (600, int(round(bh * 600 / bw))), interpolation=cv2.INTER_AREA)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cv2.imwrite(out, rgba, [cv2.IMWRITE_WEBP_QUALITY, 88])
    prev = img.copy(); cv2.rectangle(prev, (x, y), (x + bw, y + bh), (0, 0, 255), 2)
    cv2.imwrite(os.path.join(os.environ.get("TEMP", "."), "car_side_preview.jpg"), cv2.resize(prev, (w // 2, h // 2)))   # check the crop
    return rgba.shape


def background(path: str, out: str):
    img = cv2.imread(path)
    if img is None: raise SystemExit(f"cannot read {path}")
    h, w = img.shape[:2]
    target = 12 / 5
    if w / h > target: nw = int(h * target); img = img[:, (w - nw) // 2:(w - nw) // 2 + nw]
    else: nh = int(w / target); img = img[(h - nh) // 2:(h - nh) // 2 + nh]
    img = cv2.resize(img, (1920, 800), interpolation=cv2.INTER_AREA)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cv2.imwrite(out, img, [cv2.IMWRITE_WEBP_QUALITY, 72])


def main():
    p = argparse.ArgumentParser(description="Car pictures from ACC screenshots")
    p.add_argument("car", help="ACC car key, e.g. ford_mustang_gt3 (web/lib/cars.ts)")
    p.add_argument("--side", help="screenshot of the setup screen's Aero tab")
    p.add_argument("--bg", help="in-game shot for the car page's background")
    p.add_argument("--flip", action="store_true", help="mirror the side view (nose must point right)")
    a = p.parse_args()
    manifest = json.load(open(MANIFEST, encoding="utf-8")) if os.path.exists(MANIFEST) else {}
    entry = manifest.get(a.car, {})
    v = int(time.time())
    if a.side:
        shape = cut_side(a.side, os.path.join(WEB, "public", "media", "cars", "side", f"{a.car}.webp"), a.flip)
        entry["side"] = v; print("side view", shape[1], "x", shape[0])
    if a.bg:
        background(a.bg, os.path.join(WEB, "public", "media", "cars", "bg", f"{a.car}.webp"))
        entry["bg"] = v; print("background 1920 x 800")
    manifest[a.car] = entry
    with open(MANIFEST, "w", encoding="utf-8") as f: json.dump(dict(sorted(manifest.items())), f, indent=1); f.write("\n")


if __name__ == "__main__":
    main()
