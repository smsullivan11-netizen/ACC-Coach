# Kept for redoing the replay's car shapes (web/components/CarShapes.tsx). The reference pictures
# (top views the user picked, 2026-10-06; partly watermarked commercial templates) are NOT in the repo:
# put them somewhere, set IMG/OUT below, run this then make_shapes.py, paste the data into CarShapes.tsx.
"""Car top views → symmetric body profile (half-width along the length) + window polygons, in metres
(x forward, y to the driver's right). Robust to watermarks and mirrors: per slice the half-width is
the smaller of the two sides, then median-filtered along the length."""
import json, sys
sys.path.insert(0, r"C:\Users\xhane\AppData\Local\Temp\claude\c--Users-xhane-Desktop-C--\bbf124ab-9c80-4040-a37c-7daa3f1a444f\scratchpad\cv")
import cv2
import numpy as np

IMG = r"C:\Users\xhane\AppData\Local\Temp\claude\c--Users-xhane-Desktop-C--\bbf124ab-9c80-4040-a37c-7daa3f1a444f\images"
OUT = r"C:\Users\xhane\AppData\Local\Temp\claude\c--Users-xhane-Desktop-C--\bbf124ab-9c80-4040-a37c-7daa3f1a444f\scratchpad\trace"

# glass(hsv) → bool: each picture draws its windows in its own colours
CARS = {
    "m4":      dict(file="68.jpg", crop=(90, 530, 1145, 975), front="right", length=5.02, tol=6,
                    glass=lambda h, s, v: (s < 30) & (v > 105) & (v < 175)),
    "p992":    dict(file="69.jpg", crop=(5, 195, 378, 362), front="left", length=4.619, tol=6, hull=True, vents=95,
                    glass=lambda h, s, v: (s < 25) & (v > 150) & (v < 205)),
    "m720s":   dict(file="70.jpg", crop=(40, 350, 660, 645), front="left", length=4.543, tol=10, dark=True, vents=75,
                    glass=lambda h, s, v: (s < 20) & (v > 228)),
    "f296":    dict(file="71.jpg", crop=(5, 345, 645, 670), front="left", length=4.60, tol=10, dark=True, smooth=0.04, avg=0.03, vents=40,
                    glass=lambda h, s, v: (s < 25) & (v > 215)),
    "mustang": dict(file="72.jpg", crop=(392, 12, 552, 372), front="down", length=4.90, tol=10, smooth=0.07,
                    glass=lambda h, s, v: v < 45),
}


def body_mask(img, tol):
    """Everything not reachable from the picture's border through background-coloured pixels."""
    h, w = img.shape[:2]
    m = np.zeros((h + 2, w + 2), np.uint8)
    flood = img.copy()
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        cv2.floodFill(flood, m, (x, y), (255, 0, 255), (tol,) * 3, (tol,) * 3, cv2.FLOODFILL_FIXED_RANGE)
    bg = np.all(flood == (255, 0, 255), axis=2)
    car = (~bg).astype(np.uint8) * 255
    car = cv2.morphologyEx(car, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(car)
    k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return (lab == k)


def orient(arr, front):
    """Picture → nose to the right (image x = car x), driver's right = image down."""
    if front == "right":
        return arr
    if front == "left":
        return arr[::-1, ::-1]
    return np.rot90(arr, 1)   # nose down → rotate so the nose points right


result = {}
for name, cfg in CARS.items():
    img = cv2.imread(f"{IMG}\\{cfg['file']}")
    a, b, c, d = cfg["crop"]
    crop = img[b:d, a:c].copy()
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    if cfg.get("dark"):
        car = (((hsv[..., 2] < 185) | (hsv[..., 1] > 70)).astype(np.uint8)) * 255
        car = cv2.morphologyEx(car, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        cnts0, _ = cv2.findContours(car, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        car = np.zeros_like(car)
        cv2.drawContours(car, [max(cnts0, key=cv2.contourArea)], -1, 255, -1)
        car = cv2.morphologyEx(car, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
        body = car > 0
    else:
        body = body_mask(crop, cfg["tol"])
    glass = cfg["glass"](hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)) & body
    body, glass = orient(body, cfg["front"]), orient(glass, cfg["front"])
    crop_o = orient(crop, cfg["front"])
    ys, xs = np.nonzero(body)
    x0, x1 = xs.min(), xs.max()
    s = cfg["length"] / (x1 - x0)                    # metres per pixel
    cols = range(x0, x1 + 1)
    top = np.array([np.nonzero(body[:, x])[0].min() if body[:, x].any() else np.nan for x in cols], float)
    bot = np.array([np.nonzero(body[:, x])[0].max() if body[:, x].any() else np.nan for x in cols], float)
    centre = np.nanmedian((top + bot) / 2)
    half = np.minimum(centre - top, bot - centre)
    win = max(5, int(cfg.get("smooth", 0.025) * len(half)) | 1)         # ~2.5 % of the length: mirrors and spikes away
    pad = np.pad(half, win // 2, mode="edge")
    half = np.array([np.nanmedian(pad[i:i + win]) for i in range(len(half))])
    pad = np.pad(half, win // 2, mode="edge")
    avg = max(3, int(cfg.get("avg", 0.012) * len(half)) | 1)
    pad = np.pad(half, avg // 2, mode="edge")
    half = np.convolve(pad, np.ones(avg) / avg, mode="valid")[: len(half)]
    # Thin tips at the ends (an antenna, a splitter edge) trimmed: the car starts where it is a
    # quarter of its width; the outline closes square at the real width there
    ok = np.nonzero(half >= 0.25 * np.nanmax(half))[0]
    lo_i, hi_i = ok.min(), ok.max()
    # Profile, nose to tail, ~70 points (car x: + at the nose)
    idx = np.linspace(lo_i, hi_i, 70).astype(int)[::-1]
    mid = (x0 + x1) / 2
    profile = [[round((x0 + i - mid) * s, 3), round(max(0.0, half[i]) * s, 3)] for i in idx]
    # Windows: blobs of the glass colour, at least 0.4 % of the car's area, as polygons in metres
    g = cv2.morphologyEx(glass.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    g = cv2.morphologyEx(g, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cnts, _ = cv2.findContours(g, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    area = body.sum()
    windows = []
    keep = []
    for cnt in cnts:
        a_ = cv2.contourArea(cnt)
        if a_ < 0.004 * area or a_ / max(1.0, cv2.contourArea(cv2.convexHull(cnt))) < 0.75:
            continue
        keep.append(cnt)
    keep = [cv2.convexHull(k) for k in keep]   # windows are convex: watermark notches filled
    if cfg.get("hull"):
        keep = []                                  # the 992 drawing has no glass colour: cockpit set by hand
    for cnt in keep:
        sp = cv2.approxPolyDP(cnt, 0.006 * cv2.arcLength(cnt, True), True)[:, 0, :]
        windows.append([[round((p[0] - mid) * s, 3), round((p[1] - centre) * s, 3)] for p in sp])
    vents = []
    if cfg.get("vents"):
        dv = (orient(hsv[..., 2], cfg["front"]) < cfg["vents"]) & body
        dv = cv2.morphologyEx(dv.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        dc, _ = cv2.findContours(dv, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        for cnt in dc:
            if cv2.contourArea(cnt) < 0.0012 * area:
                continue
            sp = cv2.approxPolyDP(cnt, 0.02 * cv2.arcLength(cnt, True), True)[:, 0, :]
            if len(sp) >= 3:
                vents.append([[round((p[0] - mid) * s, 3), round((p[1] - centre) * s, 3)] for p in sp])
    result[name] = {"length": cfg["length"], "profile": profile, "windows": windows, "vents": vents}
    # Preview: profile (mirrored) and windows over the picture
    prev = crop_o.copy()
    pts = [(int(mid + x / s), int(centre - w / s)) for x, w in profile] + [(int(mid + x / s), int(centre + w / s)) for x, w in profile[::-1]]
    cv2.polylines(prev, [np.array(pts, np.int32)], True, (0, 0, 255), 2)
    for vpoly in vents:
        cv2.polylines(prev, [np.array([(int(mid + x / s), int(centre + y / s)) for x, y in vpoly], np.int32)], True, (0, 200, 0), 1)
    for wpoly in windows:
        cv2.polylines(prev, [np.array([(int(mid + x / s), int(centre + y / s)) for x, y in wpoly], np.int32)], True, (255, 0, 0), 2)
    cv2.imwrite(f"{OUT}\\{name}_v2.png", prev)
    print(name, "width", round(2 * max(w for _, w in profile), 3), "windows", len(windows), "vents", len(vents))

json.dump(result, open(f"{OUT}\\cars.json", "w"))
