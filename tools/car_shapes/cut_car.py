"""The team Mustang's top-down ACC screenshot → car cut out of the tarmac (GrabCut), nose to the
right, as a transparent sprite + its outline in metres."""
import json, sys
sys.path.insert(0, r"C:\Users\xhane\AppData\Local\Temp\claude\c--Users-xhane-Desktop-C--\bbf124ab-9c80-4040-a37c-7daa3f1a444f\scratchpad\cv")
import cv2
import numpy as np

SRC = r"C:\Users\xhane\AppData\Local\Temp\claude\c--Users-xhane-Desktop-C--\bbf124ab-9c80-4040-a37c-7daa3f1a444f\images\73.png"
OUT = r"C:\Users\xhane\AppData\Local\Temp\claude\c--Users-xhane-Desktop-C--\bbf124ab-9c80-4040-a37c-7daa3f1a444f\scratchpad\sprite"
LENGTH_M = 4.9

img = cv2.imread(SRC)
h, w = img.shape[:2]
mask = np.full((h, w), cv2.GC_BGD, np.uint8)
mask[400:h, 120:1890] = cv2.GC_PR_FGD                     # where the car can be
mask[600:1000, 450:1700] = cv2.GC_FGD                     # surely the car (its middle)
mask[:380, :] = cv2.GC_BGD                                # tarmac and the car's shadow above it
bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
cv2.grabCut(img, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
car = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
car = cv2.morphologyEx(car, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
car = cv2.morphologyEx(car, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(car)
k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
car = np.where(lab == k, 255, 0).astype(np.uint8)
cnts, _ = cv2.findContours(car, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
cnt = max(cnts, key=cv2.contourArea)
filled = np.zeros_like(car)
cv2.drawContours(filled, [cnt], -1, 255, -1)
x, y, bw, bh = cv2.boundingRect(cnt)
print("car box", x, y, bw, bh, "ratio", round(bh / bw, 3))

# Preview: the outline over the screenshot
prev = img.copy()
cv2.drawContours(prev, [cnt], -1, (0, 0, 255), 3)
cv2.imwrite(f"{OUT}\\cut_preview.jpg", cv2.resize(prev, (960, 600)))

# Sprite: cropped, soft edge, nose to the right (rotated 180°: the livery stays readable), 900 px long
alpha = cv2.GaussianBlur(filled, (5, 5), 0)
rgba = np.dstack([img, alpha])[y:y + bh, x:x + bw]
rgba = cv2.rotate(rgba, cv2.ROTATE_180)
scale = 900 / bw
rgba = cv2.resize(rgba, (900, int(round(bh * scale))), interpolation=cv2.INTER_AREA)
cv2.imwrite(f"{OUT}\\mustang-pcgr.webp", rgba, [cv2.IMWRITE_WEBP_QUALITY, 90])
cv2.imwrite(f"{OUT}\\mustang-pcgr.png", rgba)

# Outline in metres (car x forward = image left in the screenshot, y = the driver's right)
s = LENGTH_M / bw
cx, cy = x + bw / 2, y + bh / 2
simple = cv2.approxPolyDP(cnt, 0.002 * cv2.arcLength(cnt, True), True)[:, 0, :]
outline = [[round(-(px - cx) * s, 3), round(-(py - cy) * s, 3)] for px, py in simple]
json.dump({"length": LENGTH_M, "width": round(bh * s, 3), "outline": outline,
           "sprite": {"w": 900, "h": rgba.shape[0]}}, open(f"{OUT}\\mustang.json", "w"))
print("width m", round(bh * s, 3), "outline points", len(outline), "sprite", rgba.shape[1], "x", rgba.shape[0])
