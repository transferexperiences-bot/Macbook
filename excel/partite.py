"""Partite colleghi: le fatture nostre a loro entrano da sole dal foglio Fatture (tblFatture).
Riga 5: Fatturato · Incassato · Da incassare. Saldo = servizi + riporti - incassato. G7: ancora da fatturare."""
from gxlib import gx
EUR = "#,##0.00 €;[Red]-#,##0.00 €"
P = {"Partita Your Driver": "Your Driver", "Partita Pastoressa": "Emanuele Pastoressa", "Partita Best Things": "Best Things",
     "Partita CarloMenz": "CarloMenz", "Partita Michele NCC": "Michele NCC Puglia",
     "Partita Move In Puglia": "Move in Puglia di Marzolla Carlo", "Partita Puglia Concierge": "Puglia Concierge"}
for sh, cli in P.items():
    cur = gx("GET", f"worksheets('{sh}')/range(address='A2:J7')?$select=formulas")["formulas"]
    assert cur[2][0] == "➕ Ci devono" and cur[4][0] == "SALDO" and cur[4][1] == "=B4+E4+H4", (sh, cur[2], cur[4])
    assert all(c == "" for c in cur[3]) and cur[5][6] == "" and cur[5][7] == "", (sh, cur[3], cur[5])
    s = lambda col, tipo: f'SUMIFS(tblFatture[{col}],tblFatture[Cliente],"{cli}",tblFatture[Tipo],"{tipo}")'
    row5 = ["🧾 Fatturato da noi", f"={s('Totale', 'Fattura')}-{s('Totale', 'Nota di credito')}", "", "✔ Incassato",
            f"={s('Incassato €', 'Fattura')}-{s('Incassato €', 'Nota di credito')}", "", "⏳ Fatture da incassare", "=B5-E5"]
    gx("PATCH", f"worksheets('{sh}')/range(address='A5:H5')", {"formulas": [row5],
        "numberFormat": [["General", EUR, "General", "General", EUR, "General", "General", EUR]]})
    gx("PATCH", f"worksheets('{sh}')/range(address='B6')", {"formulas": [["=B4+E4+H4-E5"]]})
    gx("PATCH", f"worksheets('{sh}')/range(address='G7:H7')", {"formulas": [["Ancora da fatturare", "=MAX(0,B6-H5)"]],
        "numberFormat": [["General", EUR]]})
    gx("PATCH", f"worksheets('{sh}')/range(address='A2')", {"values": [["Si cambia solo la colonna D \"Prezzo servizio\". Le fatture "
        "nostre a loro entrano da sole dal foglio Fatture (riga 5) e l'incassato scala il saldo: non spostare a mano in \"Già chiusi\" "
        "i servizi fatturati."]]})
    for a in ("A5:H5", "G7:H7"):
        gx("PATCH", f"worksheets('{sh}')/range(address='{a}')/format/font", {"bold": True})
    v = gx("GET", f"worksheets('{sh}')/range(address='A4:H7')?$select=values")["values"]
    print(sh, "| fatturato", v[1][1], "incassato", v[1][4], "da incassare", v[1][7], "| SALDO", v[2][1], "| ancora da fatturare", v[3][7])
