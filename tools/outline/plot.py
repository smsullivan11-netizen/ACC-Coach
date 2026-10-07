import json, sys
import numpy as np
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
key = sys.argv[1]; zooms = [tuple(map(float, z.split(","))) for z in sys.argv[2:]]   # cx,cz,half-size
d = json.load(open(f"{key}.json")); new = json.load(open(f"{key}.new.json")); old = d["edges"]
cols = ["#ff5050", "#50a0ff", "#ffd200", "#50e080", "#c070ff", "#ff9a30"]
sess = sorted({l["s"] for l in d["laps"]}, key=int)
views = [None] + zooms
fig, axes = plt.subplots(len(views), 2, figsize=(16, 8 * len(views)))
axes = np.atleast_2d(axes)
for r, v in enumerate(views):
    for c, (title, o) in enumerate((("before (live)", old), ("after (new)", new))):
        ax = axes[r, c]; ax.set_facecolor("#151515")
        if o:
            # asphalt
            for side in ("left", "right"):
                ax.plot(o[side]["x"] + o[side]["x"][:1], o[side]["z"] + o[side]["z"][:1], color="white", lw=1.4)
        for l in d["laps"]:
            col = cols[sess.index(l["s"]) % len(cols)]
            x, z = np.array(l["x"]), np.array(l["z"])
            if not l["ok"] and l["valid"]:
                k = int(np.argmax(np.array(l["valid"]) < 0.5))
                ax.plot(x[:k], z[:k], color=col, lw=0.6, alpha=0.7); ax.plot(x[k:], z[k:], color=col, lw=0.5, alpha=0.25, ls=":")
                ax.plot(x[k], z[k], "x", color=col, ms=7)
            elif l["ok"]:
                ax.plot(x, z, color=col, lw=0.6, alpha=0.8)
        ax.set_aspect("equal"); ax.invert_yaxis(); ax.set_title(f"{key} {title}" + ("" if v is None else " (zoom)"), color="white")
        ax.tick_params(colors="#777")
        if v:
            cx, cz, s = v; ax.set_xlim(cx - s, cx + s); ax.set_ylim(cz + s, cz - s)
        else:
            allx = np.concatenate([np.array(l["x"]) for l in d["laps"] if l["ok"]]); allz = np.concatenate([np.array(l["z"]) for l in d["laps"] if l["ok"]])
            ax.set_xlim(allx.min() - 30, allx.max() + 30); ax.set_ylim(allz.max() + 30, allz.min() - 30)
fig.patch.set_facecolor("#151515"); plt.tight_layout(); plt.savefig(f"cmp_{key}.png", dpi=55)
