"""Calessino + Corse calessino: medie e percentuali di guadagno."""
from gxlib import gx
EUR, PCT = "#,##0.00 €", "0.0%"
T = 'tblCorseCalessino[Autista],$E$3,tblCorseCalessino[Mese],$B$3,tblCorseCalessino[Tieni?],"Si"'
cur = gx("GET", "worksheets('Calessino')/range(address='J6:O7')?$select=formulas")["formulas"]
assert all(x == "" for r in cur for x in r), cur
gx("PATCH", "worksheets('Calessino')/range(address='J6:O7')", {"formulas": [
    ["Incasso totale €", "Media incasso al giorno €", "Fee strutture €", "% paga autista su incasso", "Resta a noi €", "% resta a noi"],
    ["=E7+H7", "=IFERROR(J7/A7,0)", f"=SUMIFS(tblCorseCalessino[Fee],{T})", "=IFERROR(A11/J7,0)", "=J7-L7-A11", "=IFERROR(N7/J7,0)"]],
    "numberFormat": [["General"] * 6, [EUR, EUR, EUR, PCT, EUR, PCT]]})
gx("PATCH", "worksheets('Calessino')/range(address='J6:O6')/format/font", {"bold": True})
g = gx("GET", "worksheets('Calessino')/range(address='G14:G15')?$select=formulas")["formulas"]
assert g == [[""], [""]], g
gx("PATCH", "worksheets('Calessino')/range(address='G14:G15')", {"formulas": [["% paga su incasso"],
    ['=IFERROR(F15#/SUMIFS(tblCorseCalessino[Tariffa],tblCorseCalessino[Autista],$E$3,tblCorseCalessino[Data],A15#,tblCorseCalessino[Tieni?],"Si"),0)']]})
gx("PATCH", "worksheets('Calessino')/range(address='G15:G60')", {"numberFormat": [[PCT]] * 46})
gx("PATCH", "worksheets('Calessino')/range(address='G14')/format/font", {"bold": True})
# Corse calessino, riepilogo in testa (righe 4-6)
c = gx("GET", "worksheets('Corse calessino')/range(address='I4:L6')?$select=formulas")["formulas"]
assert all(x == "" for r in c for x in r), c
gx("PATCH", "worksheets('Corse calessino')/range(address='I4:L6')", {"formulas": [
    ["Media incasso al giorno €", "Media paga al giorno €", "% paga su incasso", "Media corse al giorno"]] +
    [[f"=IFERROR(C{r}/E{r},0)", f"=IFERROR(F{r}/E{r},0)", f"=IFERROR(F{r}/C{r},0)", f"=IFERROR(B{r}/E{r},0)"] for r in (5, 6)],
    "numberFormat": [["General"] * 4] + [[EUR, EUR, PCT, "0.0"]] * 2})
gx("PATCH", "worksheets('Corse calessino')/range(address='I4:L4')/format/font", {"bold": True})
print(gx("GET", "worksheets('Calessino')/range(address='J7:O7')?$select=values")["values"], gx("GET", "worksheets('Corse calessino')/range(address='I5:L6')?$select=values")["values"])
