"""The car alone, for the car page's showroom (user's request, 2026-10-09): from the same ACC Showroom
screenshots as process.py (car on the turntable, nose to the right).

  python -I tools/car_images/cutout.py <car key> shot.png
  python -I tools/car_images/cutout.py --batch <folder> --order <file>     many cars at once

1. Background removed with rembg's BiRefNet model ("birefnet-general": isnet lost the rear wings and kept
   bits of the showroom), cropped to the car.
2. The white "0" number plate of ACC's default livery painted over with the body colour (user's request:
   "ruins the visual"). Two designs: a small plate, sometimes with a #FANATECGT strip under it (found by
   its white, then grown down over the strip), and one big panel with the series logo (found by template
   matching with plate_panel.png). The area is then grown into the plate's connected light pixels (its
   shaded parts are greyer than white) once only (more leaked into windows and door shut lines), and its
   convex hull is filled row by row between the body colours on both sides (wide samples: a door seam
   in them is outvoted). EXTRA: pieces the detection misses, by hand. --keep-plate <keys>: cars whose
   number is a real livery (the Lexus's "23").
3. Saved as web/public/media/cars/cutout/<car>.webp, 1600 px wide with transparency (the car page), and
   web/public/media/cars/side/<car>.webp, 600 px (the Cars table's thumbnail; since 2026-10-10, the
   plate gone there too: before, process.py's faded crops), with their versions in web/lib/car-images.json.
Needs: pip install "rembg[cpu]" opencv-python-headless numpy (the model, about 1 GB, downloads on the
first run; a car takes about a minute on a CPU).
"""
import argparse, json, os, time
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(os.path.dirname(os.path.dirname(HERE)), "web")
MANIFEST = os.path.join(WEB, "lib", "car-images.json")
OUT = os.path.join(WEB, "public", "media", "cars", "cutout")
SIDE = os.path.join(WEB, "public", "media", "cars", "side")
EXTRA = {   # car key: [(x, y, w, h) as fractions of the cut-out]: the 720S panel's logo strip
    "mclaren_720s_gt3": [(0.552, 0.486, 0.093, 0.134)], "mclaren_720s_gt3_evo": [(0.552, 0.49, 0.093, 0.134)],
}


def cut(img, session):
    from rembg import remove
    rgba = remove(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), session=session)
    ys, xs = np.where(rgba[:, :, 3] > 16)
    return cv2.cvtColor(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1], cv2.COLOR_RGBA2BGRA)


def channels(bgra):
    b, g, r, a = [bgra[:, :, i].astype(int) for i in range(4)]
    mn, mx = np.minimum(np.minimum(b, g), r), np.maximum(np.maximum(b, g), r)
    return b, g, r, a, mn, mx


def find_plate(bgra):
    """The small plate: a white, roughly square region in the middle of the car."""
    h, w = bgra.shape[:2]
    b, g, r, a, mn, mx = channels(bgra)
    white = ((mn > 165) & (mx - mn < 35) & (a > 200)).astype(np.uint8) * 255
    white = cv2.morphologyEx(white, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))   # the "0" breaks it up
    n, lab, st, _ = cv2.connectedComponentsWithStats(white)
    best = None
    for i in range(1, n):
        x, y, bw, bh, area = st[i]
        if area < 0.003 * w * h or area > 0.06 * w * h: continue
        cx, cy = (x + bw / 2) / w, (y + bh / 2) / h
        if area / (bw * bh) < 0.55 or not (0.5 < bh / bw < 1.8) or not (0.25 < cx < 0.9 and 0.2 < cy < 0.8): continue
        if best is None or area > best[4]: best = (x, y, bw, bh, area)
    if best is None: return None
    # The #FANATECGT strip under it: its red letters break it into pieces, so the box grows down while
    # the rows stay mostly light, stepping over a thin gap of body colour
    px, py, pw, ph, _ = best
    gray = 0.114 * b + 0.587 * g + 0.299 * r
    bottom, y, dark = py + ph, py + ph, 0
    while y < min(h - 1, py + ph + int(0.7 * ph)):
        if (gray[y, px:px + pw] > 150).mean() >= 0.2: bottom, dark = y + 1, 0
        else:
            dark += 1
            if dark > 8: break
        y += 1
    m = np.zeros((h, w), np.uint8); m[py:bottom + 3, px:px + pw] = 255
    return m


def find_panel(bgra, T):
    """The big panel: template matching (a little wider or narrower: the doors are curved), then the hull
    of the white pieces around the match."""
    G = cv2.cvtColor(bgra[:, :, :3], cv2.COLOR_BGR2GRAY); h, w = G.shape
    best = (-1,)
    for s in np.arange(0.6, 1.45, 0.05):
        for sx in (0.85, 1.0, 1.15):
            t = cv2.resize(T, (int(T.shape[1] * s * sx), int(T.shape[0] * s)))
            if t.shape[0] >= h or t.shape[1] >= w: continue
            _, mv, _, ml = cv2.minMaxLoc(cv2.matchTemplate(G, t, cv2.TM_CCOEFF_NORMED))
            if mv > best[0]: best = (mv, ml, t.shape)
    score, (x, y), (th, tw) = best
    if score < 0.5: return None
    x0, y0 = max(0, x - tw // 2), max(0, y - th // 2)
    x1, y1 = min(w, x + tw + tw // 2), min(h, y + th + th // 2)
    _, _, _, a, mn, mx = channels(bgra[y0:y1, x0:x1])
    white = ((mn > 150) & (mx - mn < 40) & (a > 200)).astype(np.uint8) * 255
    white = cv2.morphologyEx(white, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, c = cv2.connectedComponentsWithStats(white)
    keep = [i for i in range(1, n) if st[i, 4] > 0.004 * tw * th
            and x <= x0 + c[i][0] <= x + tw and y - 0.8 * th <= y0 + c[i][1] <= y + 1.35 * th]
    if not keep: return None
    pts = np.column_stack(np.nonzero(np.isin(lab, keep)))[:, ::-1] + [x0, y0]
    m = np.zeros((h, w), np.uint8)
    cv2.fillConvexPoly(m, cv2.convexHull(pts.astype(np.int32)), 255)
    return cv2.dilate(m, np.ones((9, 9), np.uint8))


def bbox(m):
    ys, xs = np.nonzero(m); return xs.min(), ys.min(), xs.max() - xs.min() + 1, ys.max() - ys.min() + 1


def grow(bgra, seed):
    """The seed plus the light pixels connected to it nearby, as a convex hull."""
    h, w = seed.shape
    x0, y0, bw, bh = bbox(seed)
    X0, Y0 = max(0, x0 - int(0.35 * bw)), max(0, y0 - int(0.35 * bh))
    X1, Y1 = min(w, x0 + bw + int(0.35 * bw)), min(h, y0 + bh + int(0.35 * bh))
    b, g, r, a, mn, mx = channels(bgra[Y0:Y1, X0:X1]); s = seed[Y0:Y1, X0:X1] > 0
    gray = 0.114 * b + 0.587 * g + 0.299 * r
    body = np.median(gray[(~s) & (a > 200)])
    light = ((gray > max(110, body + 45)) & (mx - mn < 45) & (a > 200)).astype(np.uint8)
    m = (light & s).astype(np.uint8)
    for _ in range(200):
        n = cv2.dilate(m, np.ones((3, 3), np.uint8)) & light
        if (n == m).all(): break
        m = n
    pts = np.column_stack(np.nonzero((m > 0) | s))[:, ::-1] + [X0, Y0]
    out = np.zeros((h, w), np.uint8)
    cv2.fillConvexPoly(out, cv2.convexHull(pts.astype(np.int32)), 255)
    return cv2.dilate(out, np.ones((7, 7), np.uint8))


def plate_like(new, old):
    _, _, w1, h1 = bbox(new); _, _, w0, h0 = bbox(old)
    return 0.45 <= h1 / w1 <= 1.6 and w1 * h1 <= 2.3 * w0 * h0 and h1 <= 1.8 * h0 and w1 <= 1.6 * w0


def paint(bgra, mask, s=20):
    """Each row of the area filled from the body colour left of it to the one right of it."""
    out = bgra.astype(np.float32); h, w = mask.shape
    ys = np.nonzero(mask.any(axis=1))[0]
    for yy in ys:
        xs = np.nonzero(mask[yy])[0]; a, b = xs[0], xs[-1]
        L = np.median(out[yy, max(0, a - s):a, :3], axis=0) if a > 0 else None
        R = np.median(out[yy, b + 1:min(w, b + 1 + s), :3], axis=0) if b < w - 1 else None
        L = R if L is None else L; R = L if R is None else R
        t = np.linspace(0, 1, b - a + 1)[:, None]
        out[yy, a:b + 1, :3] = L * (1 - t) + R * t
    x0, y0, bw, bh = bbox(mask)
    out[y0:y0 + bh, x0:x0 + bw, :3] = cv2.GaussianBlur(out[y0:y0 + bh, x0:x0 + bw, :3], (0, 0), 2.0)
    m = cv2.GaussianBlur((mask > 0).astype(np.float32), (0, 0), 2.5)[..., None]
    res = bgra.astype(np.float32); res[:, :, :3] = out[:, :, :3] * m + res[:, :, :3] * (1 - m)
    return res.clip(0, 255).astype(np.uint8)


def remove_plate(car: str, bgra, T):
    seed = find_plate(bgra)
    how = "plate"
    if seed is None: seed, how = find_panel(bgra, T), "panel"
    if seed is None: return bgra, "no plate found"
    mask = cv2.dilate(seed, np.ones((7, 7), np.uint8))
    more = grow(bgra, mask)
    if plate_like(more, mask): mask = more   # a leak into the windows makes it tall and much bigger
    out = paint(bgra, mask)
    hh, ww = out.shape[:2]
    for x, y, w, h in EXTRA.get(car, []):
        m = np.zeros((hh, ww), np.uint8); m[int(y * hh):int((y + h) * hh), int(x * ww):int((x + w) * ww)] = 255
        out = paint(out, m); how += " + by hand"
    return out, how


def main():
    p = argparse.ArgumentParser(description="Transparent car cut-outs from ACC Showroom screenshots")
    p.add_argument("car", nargs="?", help="ACC car key, e.g. ford_mustang_gt3 (web/lib/cars.ts)")
    p.add_argument("shot", nargs="?", help="its Showroom screenshot")
    p.add_argument("--batch", help="folder of Showroom shots (sorted by name), with --order")
    p.add_argument("--order", help="file with one car key per line, in the folder's order")
    p.add_argument("--keep-plate", default="lexus_rc_f_gt3", help="comma-separated keys whose number is a real livery")
    a = p.parse_args()
    if a.batch:
        files = sorted(f for f in os.listdir(a.batch) if f.lower().endswith(".png"))
        keys = [k.strip() for k in open(a.order, encoding="utf-8") if k.strip()]
        if len(files) != len(keys): raise SystemExit(f"{len(files)} pictures but {len(keys)} cars")
        jobs = [(k, os.path.join(a.batch, f)) for k, f in zip(keys, files)]
    elif a.car and a.shot:
        jobs = [(a.car, a.shot)]
    else:
        p.error("give a car key and its screenshot, or --batch and --order")
    from rembg import new_session
    session = new_session("birefnet-general")
    T = cv2.imread(os.path.join(HERE, "plate_panel.png"), cv2.IMREAD_GRAYSCALE)
    keep = set(a.keep_plate.split(","))
    manifest = json.load(open(MANIFEST, encoding="utf-8")) if os.path.exists(MANIFEST) else {}
    v = int(time.time())
    os.makedirs(OUT, exist_ok=True); os.makedirs(SIDE, exist_ok=True)
    for car, shot in jobs:
        img = cv2.imread(shot)
        if img is None: raise SystemExit(f"cannot read {shot}")
        bgra = cut(img, session)
        bgra, how = (bgra, "plate kept") if car in keep else remove_plate(car, bgra, T)
        big = cv2.resize(bgra, (1600, round(bgra.shape[0] * 1600 / bgra.shape[1])), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(OUT, f"{car}.webp"), big, [cv2.IMWRITE_WEBP_QUALITY, 90])
        small = cv2.resize(bgra, (600, round(bgra.shape[0] * 600 / bgra.shape[1])), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(SIDE, f"{car}.webp"), small, [cv2.IMWRITE_WEBP_QUALITY, 88])
        manifest.setdefault(car, {}).update(cutout=v, side=v)
        print(f"{car}: 1600 x {big.shape[0]}, {how}", flush=True)
        with open(MANIFEST, "w", encoding="utf-8") as f: json.dump(dict(sorted(manifest.items())), f, indent=1); f.write("\n")


if __name__ == "__main__":
    main()
