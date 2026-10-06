# Kept for redoing the replay's car shapes (web/components/CarShapes.tsx). The reference pictures
# (top views the user picked, 2026-10-06; partly watermarked commercial templates) are NOT in the repo:
# put them somewhere, set IMG/OUT below, run this then make_shapes.py, paste the data into CarShapes.tsx.
"""cars.json (traced) → the TypeScript data block of components/CarShapes.tsx."""
import json
OUT = r"C:\Users\xhane\AppData\Local\Temp\claude\c--Users-xhane-Desktop-C--\bbf124ab-9c80-4040-a37c-7daa3f1a444f\scratchpad\trace"
cars = json.load(open(f"{OUT}\\cars.json"))

# The 992 picture has no glass colour: its cockpit from the drawing (windscreen at the front of the
# roof, roof sloping to the engine lid)
cars["p992"]["windows"] = [[[0.86, -0.47], [0.3, -0.58], [-0.6, -0.56], [-1.05, -0.42], [-1.05, 0.42], [-0.6, 0.56], [0.3, 0.58], [0.86, 0.47]]]


def centroid(p):
    return sum(x for x, _ in p) / len(p), sum(y for _, y in p) / len(p)


for name, c in cars.items():
    wins = c["windows"]
    # Side windows come in pairs (the cars are symmetric): mirror any that is alone
    for w in list(wins):
        cx, cy = centroid(w)
        if abs(cy) > 0.3 and not any(abs(centroid(o)[0] - cx) < 0.3 and abs(centroid(o)[1] + cy) < 0.2 for o in wins):
            wins.append([[x, -y] for x, y in w])
    # The windscreen: the frontmost window on the centreline (drawn lighter)
    central = [i for i, w in enumerate(wins) if abs(centroid(w)[1]) < 0.25]
    c["screen"] = max(central, key=lambda i: centroid(wins[i])[0]) if central else -1

fmt = lambda pts: "[" + ", ".join(f"[{x:g}, {y:g}]" for x, y in pts) + "]"
lines = []
for name, c in cars.items():
    lines.append(f"  {name}: {{")
    lines.append(f"    length: {c['length']},")
    lines.append(f"    profile: {fmt(c['profile'])},")
    lines.append("    windows: [" + ", ".join(fmt(w) for w in c["windows"]) + "],")
    lines.append(f"    screen: {c['screen']},")
    lines.append("    vents: [" + ", ".join(fmt(v) for v in c.get("vents", [])) + "],")
    lines.append("  },")
open(f"{OUT}\\shapes.ts.txt", "w").write("\n".join(lines))
print({k: (len(v["windows"]), v["screen"]) for k, v in cars.items()})
