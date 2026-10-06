"""The PCGR Mustang sprite → the same car with its yellow turned white (the replay's second car).
The yellow's brightness is kept as the white's shading; soft hue and saturation weights so the
edges of the yellow panels and logos blend without a fringe. Run from the repository's root."""
import cv2
import numpy as np

SRC = r"web\public\media\cars\mustang-pcgr.webp"
OUT = r"web\public\media\cars\mustang-pcgr-white.webp"

img = cv2.imread(SRC, cv2.IMREAD_UNCHANGED)          # BGRA, nose to the right
bgr = img[..., :3].astype(np.float32)
hsv = cv2.cvtColor(img[..., :3], cv2.COLOR_BGR2HSV).astype(np.float32)
h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]


def ramp(x, a, b):
    """0 below a, 1 above b, smooth in between."""
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# Yellow (OpenCV hue 0..180: this livery's yellow sits around 30–40)
w = ramp(h, 18, 24) * (1 - ramp(h, 44, 50)) * ramp(s, 50, 110) * ramp(v, 50, 90)
grey = np.minimum(255, v * 1.04)[..., None].repeat(3, axis=2)   # the yellow's brightness, a touch lifted
out = bgr * (1 - w[..., None]) + grey * w[..., None]
res = np.dstack([np.clip(out, 0, 255).astype(np.uint8), img[..., 3]])
cv2.imwrite(OUT, res, [cv2.IMWRITE_WEBP_QUALITY, 90])
print("yellow share", round(float((w > 0.5).sum() / (img[..., 3] > 128).sum()), 3))
