"""Ore giorno: riepilogo per autista in testa (stile Corse calessino) + colori sulle ore scelte.
Fasce: verde <=10 h · arancione 10-15 h · rosso >15 h. Uso: python3 ore_giorno.py [--colori-solo]"""
import sys, re
from gxlib import gx
SH = "Ore giorno"; N = 26   # righe inserite sopra la tabella (riepilogo fino a 20 autisti)
VERDE, ARANCIO, ROSSO = ("#C6EFCE", "#006100"), ("#FFD8A8", "#9C5700"), ("#FFC7CE", "#9C0006")
def fascia(h):
    if not isinstance(h, (int, float)) or h <= 0: return None
    return ROSSO if h > 15 else ARANCIO if h > 10 else VERDE
def addr(): a = gx("GET", "tables('tblOreGiorno')/range?$select=address")["address"].split("!")[1]; n = re.findall(r"\d+", a); return int(n[0]), int(n[1])
if "--colori-solo" not in sys.argv:
    r1, _ = addr(); assert r1 == 3, f"tabella non in riga 3 ({r1}): layout gia' applicato?"
    gx("POST", f"worksheets('{SH}')/range(address='3:{2+N}')/insert", {"shift": "Down"})
    r1, _ = addr(); assert r1 == 3 + N
    C = 'IF($B$4="",">0",$B$4)'; K = f'tblOreGiorno[Autista],A7#,tblOreGiorno[Mese],{C}'
    rows = [["RIEPILOGO PER AUTISTA", "", "", "", "", "", "", "", "", "", "", ""],
            ["Mese", 10, "← scegli il mese (numero) nella cella gialla · vuoto = tutto l'anno", "", "", "", "", "", "Media generale h/giorno", "=IFERROR(SUM(C7#)/SUM(B7#),0)", "", ""],
            ["Colori ore al giorno:", "fino a 10 h", "10 - 15 h", "oltre 15 h", "", "", "", "", "", "", "", ""],
            ["Autista", "Giorni", "Ore totali", "Media h/giorno", "Max h in un giorno", "Giorni ≤10 h", "Giorni 10-15 h", "Giorni >15 h", "Media Fogli h", "Media Moox h", "Fascia media", ""],
            ['=IFERROR(SORT(UNIQUE(FILTER(tblOreGiorno[Autista],(tblOreGiorno[Autista]<>"")*IF($B$4="",1,tblOreGiorno[Mese]=$B$4)))),"")',
             f'=COUNTIFS({K},tblOreGiorno[Ore scelte],">0")', f'=SUMIFS(tblOreGiorno[Ore scelte],{K})', '=IFERROR(C7#/B7#,0)',
             f'=MAXIFS(tblOreGiorno[Ore scelte],{K})', f'=COUNTIFS({K},tblOreGiorno[Ore scelte],">0",tblOreGiorno[Ore scelte],"<=10")',
             f'=COUNTIFS({K},tblOreGiorno[Ore scelte],">10",tblOreGiorno[Ore scelte],"<=15")', f'=COUNTIFS({K},tblOreGiorno[Ore scelte],">15")',
             f'=IFERROR(AVERAGEIFS(tblOreGiorno[Fogli h],{K}),"")', f'=IFERROR(AVERAGEIFS(tblOreGiorno[Moox h],{K}),"")',
             '=IF(D7#="","",IF(D7#>15,"🔴 oltre 15 h",IF(D7#>10,"🟠 10-15 h","🟢 fino a 10 h")))', ""]]
    gx("PATCH", f"worksheets('{SH}')/range(address='A3:L7')", {"formulas": rows})
    for a, k in (("A3", {"bold": True, "size": 12}), ("A6:K6", {"bold": True}), ("A4", {"bold": True}), ("I4:J4", {"bold": True})):
        gx("PATCH", f"worksheets('{SH}')/range(address='{a}')/format/font", k)
    gx("PATCH", f"worksheets('{SH}')/range(address='B4')/format/fill", {"color": "#FFF2CC"})
    for c, (bg, fg) in zip("BCD", (VERDE, ARANCIO, ROSSO)):
        gx("PATCH", f"worksheets('{SH}')/range(address='{c}5')/format/fill", {"color": bg}); gx("PATCH", f"worksheets('{SH}')/range(address='{c}5')/format/font", {"color": fg, "bold": True})
    gx("PATCH", f"worksheets('{SH}')/range(address='A6:K6')/format/fill", {"color": "#DDEBF7"})
    gx("PATCH", f"worksheets('{SH}')/range(address='C7:J26')", {"numberFormat": [["0.0"] * 8] * 20})
    gx("PATCH", f"worksheets('{SH}')/range(address='J4')", {"numberFormat": [["0.0"]]})
# colori sulle ore scelte (colonna H) e sulle 4 fonti (C:F): righe consecutive dello stesso colore in un colpo solo
r1, r2 = addr()
v = gx("GET", f"worksheets('{SH}')/range(address='C{r1+1}:H{r2}')?$select=values")["values"]
for ci, col in enumerate("CDEFGH"):
    if col == "G": continue
    run = None
    def chiudi(run):
        if not run: return
        a, b, f = run
        rg = f"{col}{a}:{col}{b}"
        gx("PATCH", f"worksheets('{SH}')/range(address='{rg}')/format/fill", {"color": f[0]} if f else {})
        if f: gx("PATCH", f"worksheets('{SH}')/range(address='{rg}')/format/font", {"color": f[1]})
    for i, r in enumerate(v):
        f = fascia(r[ci]); rn = r1 + 1 + i
        if f is None: chiudi(run); run = None; continue
        if run and run[2] == f and run[1] == rn - 1: run[1] = rn
        else: chiudi(run); run = [rn, rn, f]
    chiudi(run)
print("ok", r1, r2)
