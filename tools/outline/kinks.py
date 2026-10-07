import json, glob
import numpy as np
def kinks(e):
    out = []
    for side in ("left", "right"):
        x, z = np.array(e[side]["x"]), np.array(e[side]["z"])
        P = np.column_stack([x, z]); P = np.vstack([P, P[:4]])
        d = np.diff(P, axis=0); a = np.unwrap(np.arctan2(d[:, 1], d[:, 0]))
        turn = np.abs(np.degrees(a[2:] - a[:-2]))          # direction change over ~4 m
        idx = np.flatnonzero(turn > 25)
        out += [(side, int(i), float(P[i][0]), float(P[i][1]), float(turn[i])) for i in idx]
    return out
for f in sorted(glob.glob("*.new.json")):
    key = f[:-9]; d = json.load(open(f"{key}.json")); new = json.load(open(f)); old = d["edges"]
    ko, kn = kinks(old) if old else [], kinks(new) if new else []
    # group into spots (points within 15 m)
    def spots(k):
        s = []
        for side, i, x, z, t in sorted(k, key=lambda r: r[1]):
            if not s or abs(s[-1][1] - i) > 8 or s[-1][0] != side: s.append([side, i, x, z, t])
            else: s[-1][4] = max(s[-1][4], t)
        return s
    so, sn = spots(ko), spots(kn)
    print(f"{key:16} sharp kinks: before {len(so):3} spots   after {len(sn):3} spots   " + ("worst before: " + ", ".join(f"({x:.0f},{z:.0f}) {t:.0f}°" for _, _, x, z, t in sorted(so, key=lambda r: -r[4])[:3]) if so else ""))
