"""Old vs new consistency on the production data, read-only (SELECTs in a read-only transaction).
Old = web/lib/ratings.ts today: median gap of valid laps (stint trend on runs of 6+ valid laps).
New = average of gaps capped at 3 %; invalid flying laps measured against the same reference:
race = full weight (capped), practice/qualifying = half weight when within 3 %, ignored beyond.
The connection string is read from web/.env.production.local and never printed."""
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

import psycopg

ROOT = Path(r"C:\Users\xhane\Desktop\ACC_Project")
env = (ROOT / "web" / ".env.production.local").read_text(encoding="utf-8")
m = re.search(r"^\s*DATABASE_URL\s*=\s*\"?([^\"\r\n]+)\"?", env, re.M)
URL = m.group(1).strip()

FULL, ZERO, CAP, HALF = 0.001, 0.03, 0.03, 0.5
TREND_MIN = 6
FORM_DAYS, FORM_MIN = 60, 5
OLD_W = {"practice": (56, 24, 10, 10), "qualifying": (62, 18, 10, 10), "race": (45, 30, 15, 10), "mixed": (55, 25, 10, 10)}
NEW_W = {"practice": (55, 25, 10, 10), "qualifying": (62, 18, 10, 10), "race": (45, 30, 15, 10)}

# fuel correction (web/lib/fuel.ts)
REF_L = dict.fromkeys("brands_hatch zolder misano donington oulton_park laguna_seca zandvoort red_bull_ring hungaroring valencia kyalami imola barcelona indianapolis snetterton".split(), 8)
REF_L.update(dict.fromkeys("spa monza silverstone suzuka cota paul_ricard mount_panorama nurburgring watkins_glen".split(), 10)); REF_L["nurburgring_24h"] = 15
S10 = dict(imola=.175, monza=.15, brands_hatch=.125, barcelona=.15, paul_ricard=.175, spa=.2, cota=.2, donington=.125, hungaroring=.175,
           indianapolis=.175, kyalami=.16, laguna_seca=.125, misano=.15, mount_panorama=.18, nurburgring_24h=.78, nurburgring=.15,
           red_bull_ring=.15, oulton_park=.15, valencia=.175, silverstone=.2, snetterton=.175, suzuka=.18, watkins_glen=.175, zandvoort=.15, zolder=.15)
def fuel_s(track, f):
    if f is None or not math.isfinite(f): return 0.0
    k = track.lower()
    return S10.get(k, .16) / 10 * 0.72 * max(0.0, f - REF_L.get(k, 10))

def rtype(chosen, acc, merged):
    if chosen in ("practice", "qualifying", "race"): return chosen
    if chosen == "mixed": return "practice" if merged else "mixed"
    if acc == "practice": return "practice"
    if acc in ("qualify", "qualifying", "hotlap", "superpole", "hotstint_superpole"): return "qualifying"
    if acc in ("race", "hotstint"): return "race"
    return "practice" if merged else "mixed"

def median(x):
    s = sorted(x); n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2

def score(g): return max(0.0, min(100.0, 100 * (1 - (g - FULL) / (ZERO - FULL))))

def is_pit(r): return any(x.startswith("pit_") for x in r)
def is_flying(r): return not any(x.startswith("pit_") or x in ("distance", "track_edges") for x in r)

def gaps(laps, typ):
    """laps: (number, t, valid, reasons). Returns (old median gaps list, new weighted gaps)."""
    runs = [[]]
    for n, t, v, r in sorted(laps):
        if is_pit(r):
            if runs[-1]: runs.append([])
            continue
        if v or is_flying(r): runs[-1].append((n, t, v))
    validt = [t for n, t, v, r in laps if v]
    best = min(validt)
    old, new = [], []
    for run in runs:
        vr = [(n, t) for n, t, v in run if v]
        if not vr: continue
        slope = 0.0
        if len(vr) >= TREND_MIN:
            slope = median([(vr[j][1] - vr[i][1]) / (vr[j][0] - vr[i][0]) for i in range(len(vr)) for j in range(i + 1, len(vr))])
        d = [t - slope * n for n, t in vr]
        base = min(d); k = d.index(base)
        for i, x in enumerate(d):
            if i != k:
                g = (x - base) / best
                old.append(g); new.append((min(g, CAP), 1.0))
        for n, t, v in run:
            if v: continue
            g = abs(t - slope * n - base) / best
            if typ == "race": new.append((min(g, CAP), 1.0))
            elif g <= CAP: new.append((g, HALF))
    return old, new

with psycopg.connect(URL) as con:
    con.read_only = True
    cur = con.cursor()
    cur.execute("""select s.id, d.display_name, t.key, coalesce(s.recorded_at, s.uploaded_at), s.session_type,
                          to_jsonb(s) ->> 'rating_type', s.driver_id
                   from session s join driver d on d.id = s.driver_id join track t on t.id = s.track_id""")
    sessions = {r[0]: r for r in cur.fetchall()}
    cur.execute("""select session_id, number, coalesce(official_lap_time_ms, game_lap_time_ms, lap_time_ms), comparable,
                          excluded_reasons, (metrics->>'fuel_l')::float from lap""")
    laps = defaultdict(list)
    for sid, n, t, comp, reasons, fuel in cur.fetchall():
        if t is None: continue
        laps[sid].append((n, t, comp, reasons or [], fuel))
    cur.execute("""select distinct on (session_id) session_id, id, pace, consistency, clean, smoothness, laps, session_score
                   from driver_rating order by session_id, id desc""")
    ratings = {r[0]: r for r in cur.fetchall()}
    cur.execute("select distinct unnest(excluded_reasons) from lap")
    print("excluded reasons in the data:", sorted(x[0] for x in cur.fetchall()))

rows = []
for sid, (sid_, driver, track, at, acc, chosen, did) in sessions.items():
    ls = [(n, t - 1000 * fuel_s(track, f), v, r) for n, t, v, r, f in laps.get(sid, [])]
    nvalid = sum(1 for l in ls if l[2])
    if nvalid == 0 or sid not in ratings: continue
    typ_old, typ_new = rtype(chosen, acc, False), rtype(chosen, acc, True)
    old_g, new_g = gaps(ls, typ_new)
    ninv = sum(1 for n, t, v, r in ls if not v and is_flying(r))
    old_c = score(median(old_g)) if nvalid >= 3 and old_g else None
    capped_valid = [g for g, w in new_g if w == 1.0][: len(old_g)]
    mean_valid = score(sum(min(g, CAP) for g in old_g) / len(old_g)) if nvalid >= 3 and old_g else None
    new_c = score(sum(g * w for g, w in new_g) / sum(w for g, w in new_g)) if nvalid >= 3 and new_g else None
    rid, pace, cons_db, clean, smooth, nl, sscore = ratings[sid][1:]
    def sess_score(cons, W):
        parts = (pace, cons, clean, smooth); tot = wsum = 0
        for p, w in zip(parts, W):
            if p is not None: tot += p * w; wsum += w
        return tot / wsum
    rows.append(dict(sid=sid, driver=driver, did=did, track=track, at=at, typ=typ_new, typ_old=typ_old, nvalid=nvalid, ninv=ninv,
                     db=cons_db, old=old_c, mean_valid=mean_valid, new=new_c, laps=nl, rid=rid,
                     s_old=sscore, s_new=sess_score(new_c, NEW_W[typ_new])))

def fmt(x): return "  -  " if x is None else f"{x:5.1f}"
print(f"\n{'driver':10} {'track':15} {'date':10} {'type':10} {'val':>3} {'inv':>3} | {'stored':>6} {'old':>5} {'meanV':>5} {'new':>5} | {'score':>5} -> {'new':>5}")
for r in sorted(rows, key=lambda r: (r["driver"].lower(), r["at"])):
    print(f"{r['driver'][:10]:10} {r['track'][:15]:15} {r['at']:%d %b}     {r['typ'][:10]:10} {r['nvalid']:3} {r['ninv']:3} | "
          f"{fmt(r['db']):>6} {fmt(r['old'])} {fmt(r['mean_valid'])} {fmt(r['new'])} | {r['s_old']:5.1f} -> {r['s_new']:5.1f}")

# Current form per driver (best session per track in the 60 days before the latest; 5+ valid laps)
def form(rs, key):
    last = max(r["at"] for r in rs)
    win = [r for r in rs if (last - r["at"]).days < FORM_DAYS]
    pool = [r for r in win if r["laps"] >= FORM_MIN] or win
    best = {}
    for r in sorted(pool, key=lambda r: (r[key], r["rid"])):
        best[r["track"]] = r
    sel = list(best.values())
    cons = [r["new" if key == "s_new" else "db"] for r in sel if r["new" if key == "s_new" else "db"] is not None]
    return sum(r[key] for r in sel) / len(sel), (sum(cons) / len(cons) if cons else None)
by = defaultdict(list)
for r in rows: by[r["driver"]].append(r)
print(f"\n{'driver':12} {'rating old':>10} {'new':>6} {'diff':>6} | {'consistency old':>15} {'new':>6}")
for d, rs in sorted(by.items(), key=lambda kv: -form(kv[1], "s_old")[0]):
    (ro, co), (rn, cn) = form(rs, "s_old"), form(rs, "s_new")
    print(f"{d[:12]:12} {ro:10.1f} {rn:6.1f} {rn - ro:+6.1f} | {fmt(co):>15} {fmt(cn):>6}")
