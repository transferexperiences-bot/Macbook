"""Stesso stile di tblCorseCalessino (TableStyleMedium2) su tutte le tabelle."""
from gxlib import gx
for t in gx("GET", "tables?$select=name,style")["value"]:
    if t["style"] != "TableStyleMedium2":
        gx("PATCH", f"tables('{t['name']}')", {"style": "TableStyleMedium2"}); print(t["name"], t["style"], "-> TableStyleMedium2")
