# TE Planner

Web app Google Apps Script per organizzare i transfer di Transfer Experience.

- **Il codice gira su script.google.com** (progetto "TE Planner"), questa cartella è la copia
  di lavoro. `src/Code.gs` → file `Codice.gs`, `src/Index.html` → file `Index`.
- Contesto completo per lavorarci: **[CLAUDE.md](CLAUDE.md)**.
- Cosa è stato corretto e perché: [docs/REVISIONE_v5.md](docs/REVISIONE_v5.md),
  [docs/ASSEGNA.md](docs/ASSEGNA.md) (scheda Assegna e consiglio autista, 18/08/2026).

## Per iniziare

```bash
npm i -D playwright && npx playwright install chromium   # solo per i test end-to-end
./run-tests.sh                                           # 142 controlli
python3 tools/build-preview.py && open preview.html      # la app in locale, con dati finti
```

## Prima di incollare nel progetto

`Index` deve iniziare con `<!DOCTYPE html>`, `Codice.gs` con `/**`.
Poi: **Esegui il deployment → Gestisci i deployment → ✏️ → Versione: Nuova versione**.
