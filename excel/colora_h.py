import json
from gxlib import gx
v = gx("GET", "worksheets('Ore giorno')/range(address='H30:H418')?$select=values")["values"]
F = (("#FFC7CE", "#9C0006"), ("#FFD8A8", "#9C5700"), ("#C6EFCE", "#006100"))
def fa(h): return None if not isinstance(h, (int, float)) or h <= 0 else F[0] if h > 15 else F[1] if h > 10 else F[2]
runs, cur = [], None
for i, (h,) in enumerate(v):
    f = fa(h); rn = 30 + i
    if cur and cur[2] == f and cur[1] == rn - 1: cur[1] = rn
    else:
        if cur and cur[2]: runs.append(cur)
        cur = [rn, rn, f]
if cur and cur[2]: runs.append(cur)
print("blocchi", len(runs), flush=True)
for a, b, (bg, fg) in runs:
    gx("PATCH", f"worksheets('Ore giorno')/range(address='H{a}:H{b}')/format/fill", {"color": bg})
    gx("PATCH", f"worksheets('Ore giorno')/range(address='H{a}:H{b}')/format/font", {"color": fg, "bold": True})
print("fatto", flush=True)
