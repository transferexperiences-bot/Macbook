# TE Planner — contesto per Claude Code

Web app **Google Apps Script** che organizza i transfer di **Transfer Experience** (NCC in
Puglia, base a Polignano a Mare). Legge e scrive direttamente sul gestionale Google Sheets
**"Programma Autisti 2.0"**.

Serve a: vedere i servizi del giorno a colpo d'occhio, assegnare autisti e mezzi senza
sovrapposizioni, capire quando una persona o un veicolo si libera, far partire le notifiche
ai driver.

L'interfaccia è **in italiano**: testi, commenti e nomi delle funzioni nuove vanno in
italiano, come il resto del codice.

---

## ⚠️ Questo repo non è la sorgente di verità

Il codice **gira su script.google.com**, nel progetto Apps Script **"TE Planner"**
(account `transfer.experiences@gmail.com`). Questa cartella è la copia su cui lavorare.

| File qui | File nel progetto Apps Script |
|---|---|
| `src/Code.gs` | `Codice.gs` (file .gs) |
| `src/Index.html` | `Index` (file HTML) |

Dopo ogni modifica, il ciclo è: **incolla → salva → Esegui il deployment → Gestisci i
deployment → ✏️ → Versione: Nuova versione**. Senza «Nuova versione» l'URL continua a
servire la versione vecchia.

**Errore già successo una volta**: incollare `Code.gs` dentro il file `Index`. Apps Script
risponde *«Contenuti HTML non corretti»* seguito dal sorgente del backend. Controllo di tre
secondi prima di salvare:

- `Index` deve iniziare con `<!DOCTYPE html>`
- `Codice.gs` deve iniziare con `/**`

`./run-tests.sh` verifica questa condizione automaticamente.

Se si vuole automatizzare il push, si può usare [`clasp`](https://github.com/google/clasp)
(`clasp login`, `clasp clone <scriptId>`), ma **non è configurato**: oggi si fa a mano.

---

## Struttura

```
src/Code.gs           backend: legge il foglio, calcola durate e incastri, scrive, notifica
src/Index.html        tutta l'interfaccia: HTML + CSS + JS in un file solo (niente build)
test/_lib.js          carica backend e frontend in Node con gli oggetti Google finti
test/backend.test.js  parser importi/date, "stesso luogo", stima tempi        (43 controlli)
test/motore.test.js   trasferimenti, conflitti, candidati autista/mezzo       (51 controlli)
test/app.test.js      apre la app in Chromium e la usa davvero                (57 controlli)
tools/build-preview.py  genera preview.html: la app con dati finti, apribile in locale
tools/screenshot.js     screenshot delle schede a varie larghezze → shots/
run-tests.sh          sintassi + preview + le tre batterie
docs/                 revisione v4→v5, scheda Assegna, handoff originale, installazione
```

`preview.html` e `shots/` sono generati, non versionarli.

---

## Comandi

```bash
./run-tests.sh                     # tutto: sintassi, backend, motore, end-to-end
node test/backend.test.js          # solo backend (veloce, niente browser)
node test/motore.test.js           # solo motore lato app (veloce, niente browser)
node test/app.test.js              # end-to-end in Chromium
python3 tools/build-preview.py     # rigenera preview.html dopo aver toccato src/Index.html
node tools/screenshot.js flotta 1440
open preview.html                  # guarda la app in locale, con dati finti
```

Playwright serve solo per `app.test.js` e per gli screenshot:
`npm i -D playwright && npx playwright install chromium`.
Se hai un Chromium tuo: `PW_CHROMIUM=/percorso/chromium node test/app.test.js`.

**Dopo ogni modifica a `src/Index.html` rigenera la preview**, altrimenti i test end-to-end
girano sulla versione precedente.

---

## Come è fatto

### Il foglio

`SPREADSHEET_ID = 1nqmt8_4Oy8paHlPU8LTBLEvl-quW0DYgTtmB73nBxPw`

| Tab | Contenuto |
|---|---|
| `Prenotazioni NCC 3.0` | i transfer (la tabella principale) |
| `Autisti` | nome, categoria, stato, riposo fisso, indisponibilità |
| `Veicoli` | nome, mezzo, posti, stato |
| `Luoghi` | nome → coordinate (riempito dal workflow n8n "Risolvi Luogo") |
| `Rent` | noleggi attivi |
| `Fornitori e strutture` | elenco fornitori |
| `_CacheTratte` | nascosto: `v2\|da\|\|\|per` → minuti, km, data |
| `_Log` | nascosto: ogni modifica fatta dalla app |
| `_LuoghiDuplicati` | nascosto: backup di `pulisciLuoghi()` |
| `_Precalcolo` | opzionale: Id, durata, coordinate, rientro (se lo popola n8n) |

Le colonne si trovano **per nome, non per posizione** (`headerIndex` + `col`), con più
alias per ognuna: rinominare una colonna nel foglio di solito non rompe niente, spostarla
mai. Se aggiungi una colonna, aggiungi il suo alias in `prenCols_`.

### I tempi: tre attori, un compito ciascuno

1. **"Risolvi Luogo" (n8n, già esistente)** — l'unico che chiama Google Places. Riempie
   `Luoghi` con le coordinate. La app non lo invoca mai.
2. **Precalcolo (Apps Script)** — l'unico che chiama Google Maps. Riempie `_CacheTratte`
   con: durata di ogni servizio, tratte drop-off→pickup fra servizi dello stesso giorno,
   rientro alla base da ogni drop-off. È **idempotente**: salta ciò che è già in cache.
3. **La app** — non chiama nessuno, legge valori pronti. Per questo si apre veloce.

`ALLOW_MAPS` è `false` a runtime e viene messo a `true` solo dai trigger
(`precalcolaCatene`, `onNuovoTransfer`). **Non chiamare Google Maps dentro `getPlanData`.**

### Regola di fattibilità (identica a Turni v6)

```
fine servizio A + trasferimento A→B + buffer  ≤  inizio servizio B
```

Buffer: 15 min · 10 se vicini (<5 km o <10 min) · **0 se stesso luogo**.
Durata servizio = tempo Maps Da→Per **× 1,3** + `h extra` × 60, minimo 15 minuti.

Fra un servizio e l'altro l'autista va **diretto**: il rientro alla base si conta solo dopo
l'**ultimo** servizio della giornata (`rientroMin` su ogni servizio).

### Chi consigliare per un servizio scoperto

Un solo posto decide: `valutaAutista(S, nome)` → `punteggioAutista(a, v)` (in `Index.html`).
Consigli, menù del dettaglio e ordine dei blocchi nella scheda Assegna leggono di lì: due
classifiche diverse per lo stesso servizio erano già successe.

`valutaAutista` restituisce un giudizio `k` e i due margini:

| `k` | significato | come si vede |
|---|---|---|
| `ok` | si aggancia al giro | verde, `➕ Assegna` |
| `stretto` | ci arriva ma il margine è sotto `STRETTO` (20 min) | ambra |
| `fermo` | ha servizi oggi, ma il vuoto supera `ATTESA_LONTANO` (4 h) | grigio |
| `libero` | **oggi non ha servizi** | grigio, gruppo separato |
| `no` | si sovrappone a un suo servizio | rosso, solo `⚡ Forza` |
| `off` | Stato OFF / riposo fisso / indisponibilità | non assegnabile |

L'ordine è: chi si incastra nel giro → chi è in servizio ma lontano → chi oggi non lavora.
Dentro il primo gruppo conta il **tempo morto prima** del servizio (`vuoto`), non il lato più
stretto: ordinare per il lato più stretto premiava i giri fragili (5 minuti di margine dopo
sembravano meglio di mezz'ora d'attesa comoda). Categoria (`Fisso`) e carico di giornata
restano, ma come spareggio.

### Cosa manda `getPlanData(dateISO)` alla app

`{date, today, weekday, nowMin, services[], transfers{}, autisti[], veicoli[], rents[],
prossimi[], luoghiNomi[], fornitori[], bufferDefault, base}`

- `services[]`: `rowNum, id, time, startMin, endMin, durMin, rientroMin, da, per, pax, nome,
  fornitore, volo, autista, veicolo, note, stato, allert, tariffa, cell, wa, hextra,
  modalita, acconto, durSrc`
- `transfers{}`: chiave `"idA->idB"` → `{min, buffer}`, solo per le coppie plausibili
  (A finisce entro 4 ore dall'inizio di B)
- `nowMin` = minuti da mezzanotte, **-1 se la data mostrata non è oggi**: tutta la logica
  "occupato adesso / countdown" è condizionata a `nowMin >= 0`

Risultato in cache 30 s; ogni scrittura chiama `bumpVer_()` che invalida.

### Webhook n8n

- `POST /webhook/autista-onchange` — propaga autista/mezzo ai gestionali delle strutture
- `POST /webhook/8493d199-…` — **Promemoria Autisti 4**, notifica immediata al driver
  (`delay_seconds: 0`, `data.allert` = Invia | Modificato | Cancellato | Recap, `force: true`
  per scavalcare il Gate Hide)

Il soft delete replica quello di Telegram: `Allert = "Cancellato"` +
`Note += "Cancellazione gg/mm/aaaa hh:mm"`. **La riga non viene mai eliminata.**

---

## Trappole da non ripetere

Ognuna di queste è stata un bug vero, con il test che la copre. Prima di toccare quelle
zone, leggi `docs/REVISIONE_v5.md`.

1. **Importi.** Mai `replace(/\./g,'')` sugli euro: il foglio manda `150.5` e diventerebbe
   `1505`. Usa `parseEuro_()` (backend) ed `eur()` (frontend), che riconoscono il separatore
   decimale.
2. **Nomi dentro gli `onclick`.** `esc()` non gestisce l'apice: un autista come *D'Amico*
   spezza l'attributo. **Passa sempre l'indice**, mai la stringa.
3. **Riscritture inutili sul foglio.** La app rimanda tutti i campi a ogni salvataggio:
   `updateService` deve scrivere Data, Ora, Tariffa e Acconto **solo se sono cambiati**,
   altrimenti converte le celle Data/Ora native in testo e rompe Turni v6 e n8n.
4. **"Stesso luogo".** Mai confrontare i nomi con `===`. `Aeroporto di Bari`, `Apt Bari` e
   `Aeroporto di Bari - Arrivi` sono lo stesso posto → trasferimento **0** e buffer **0**.
   Usa `stessoLuogo_()` / `stessoLuogoUI()`. Attenzione: la normalizzazione **non deve**
   togliere il nome della città, o Bari e Brindisi collassano.
5. **Minimi fissi sui tempi.** `Math.max(10, …)` faceva risultare irraggiungibili due punti
   a 300 metri. Usa `stimaMin_()`.
6. **`pulisciLuoghi()`.** La normalizzazione dei duplicati è aggressiva: se togli la città
   dalla chiave, i due aeroporti diventano lo stesso record e uno viene cancellato **con le
   sue coordinate**. C'è una rete di sicurezza sulle coordinate (>500 m ⇒ luoghi distinti):
   non rimuoverla.
7. **Webhook con valori vecchi.** `autista || curAut` manda il vecchio nome quando svuoti il
   campo. Calcola il valore effettivo prima di scrivere.
8. **Date in UTC.** `new Date().toISOString()` dà il giorno sbagliato dopo le 22:00 con l'ora
   legale. Usa `isoLocal()` / `oggiLocal()`.
9. **Trigger `onNuovoTransfer` (Al cambio).** Scatta anche sulle scritture dello script: un
   *Salva tutto* su 10 righe lo lancerebbe 10 volte. `bumpVer_()` lascia un marcatore in
   cache e il trigger ignora i 20 secondi successivi. Non togliere quella guardia.
10. **Precedenze in JavaScript.** `a && b || c` non è `a && (b || c)`: è già costato la lista
    autisti della Flotta. Metti le parentesi.
11. **Consigliare chi non sta lavorando.** La prima versione pesava la categoria (300 per chi
    non era «Fisso») più di «non ha nessun servizio oggi» (200): il consiglio finiva quasi
    sempre su un autista fermo a casa invece di allungare il giro di chi era già fuori.
    Chi oggi non lavora va **in fondo e marcato** (`⚠️`, gruppo `💤 Oggi non lavorano`),
    mai mescolato ai disponibili.

---

## Convenzioni

- **`src/Code.gs` è ES5** (Apps Script): niente `let`, `const`, arrow function, template
  literal. `src/Index.html` idem, per sicurezza sui browser dei telefoni.
- **Un file solo per l'interfaccia**: niente build, niente bundler, niente dipendenze.
  CSS nel `<style>`, JS nel `<script>`, entrambi dentro `Index.html`.
- **Mobile first.** La app nasce per il telefono; il blocco desktop è un `@media
  (min-width: 820px)` in fondo al CSS. Ogni modifica va guardata a **390px e 1440px**.
- **Funzioni private del backend** con l'underscore finale (`stessoLuogo_`), come già fatto.
- **`localStorage` si può usare**: è una web app Apps Script, non un artifact.
- Le preferenze dell'utente (`te_due`, `te_ass_solo`) stanno in `localStorage`; i filtri di
  sessione (`AUT_HIDE`, `VEI_HIDE`, `FFILT`) e la colonna scelta sul telefono (`ASS_VISTA`)
  no, e va bene così: si riparte sempre dalla coda.
- **Aggiungi un test** per ogni comportamento nuovo o corretto. La batteria end-to-end ha
  già trovato due difetti che sarebbero arrivati in produzione.

---

## Cosa fa la app, scheda per scheda

**📋 Servizi** — righe colorate (o card). Filtri *Tutti / Da fare / Svolti*; ordinamento per
*Orario / Autista / Mezzo / Fornitore / Scoperti prima*; due file di chip per nascondere
autisti e mezzi; interruttore **2 giorni** (oggi e domani impilati). Ordinando per autista o
per mezzo con 2 giorni attivo, le due giornate diventano **un elenco solo** raggruppato, con
i collegamenti fra un servizio e l'altro (`🕳 buco`, `⏱ stretto`, `⛔ non ci arriva`,
`📍 stesso posto`, `🌙 stacco notturno`). Sulle righe scoperte: **candidato autista** e
**candidato mezzo** assegnabili con un tocco — il candidato che oggi **non ha servizi** è
grigio e marcato `⚠️`, non del colore dell'autista.

**Dettaglio servizio** — menù Autista diviso in Consigliati / Disponibili *già in servizio
oggi* / Occupati forzabili / *Oggi non lavorano* / Non disponibili, Veicolo in Disponibili /
Occupati forzabili / Capienza insufficiente / Non disponibili; tutti i campi modificabili; pulsanti 📣 Invia ·
✏️ Modifica · 📋 Recap · 🔕 No · ✅ Eseguito · 🗑 Cancella. Il 💾 Salva **accumula**: si
scrive tutto insieme dalla barra gialla in alto.

**🧩 Assegna** — la scheda per smistare. A **sinistra** i giri, un blocco per autista, con i
suoi servizi in ordine di ora e i vuoti fra l'uno e l'altro (`🕳`, `⏱ stretto`,
`⛔ non ci arriva`, `📍 stesso posto`). A **destra** i servizi ancora **da assegnare**, in
ordine di ora, ognuno con i tre autisti consigliati assegnabili con un tocco; sotto, quelli
che hanno l'autista ma non il mezzo. Toccando un servizio a destra, a sinistra ogni autista
dice se ci arriva e il servizio compare **dentro il suo giro** come riga tratteggiata, al
posto d'orario che avrebbe, con attesa prima e margine dopo. Il pulsante `👥 Solo chi lavora`
tiene fuori chi oggi non ha servizi. **Sul telefono** le colonne non ci stanno affiancate:
si vede una per volta, con i due bottoni in alto (🕐 Da assegnare · 🚹 Giri autisti). Toccando
un servizio nella coda si passa da soli ai giri, con una striscia gialla che ricorda quale
servizio si sta piazzando; assegnato, si torna alla coda per il prossimo.

**⏳ Flotta** — autisti e mezzi raggruppati per stato (*Impegnati ora / Liberi ora / Non
disponibili*) con contatori cliccabili. Un mezzo occupato è rosso, con barra di
avanzamento, chi lo guida, quando e dove si libera, e l'ora di rientro in garage.

**📊 Timeline** — barre orarie: servizio pieno, trasferimento semitrasparente, attesa grigia,
rientro tratteggiato, linea rossa "adesso".

**🔑 Rent** — noleggi attivi nella data; i mezzi a noleggio non sono selezionabili.

---

## Stato e cose aperte

Fatto: revisione completa v4→v5 (12 bug), rientro in garage, layout desktop, vista 2 giorni,
filtri autisti e mezzi, Flotta ridisegnata, ordinamento per mezzo, candidato mezzo,
bug delle catene "stesso luogo". Poi (18/08): **scheda 🧩 Assegna** (giri a sinistra, coda per
ora a destra) e **riscrittura del consiglio autista**, che proponeva chi non stava lavorando.
**151 controlli automatici, tutti verdi.**

Da fare fuori dal codice:

- [ ] Incollare `src/Index.html` nel progetto e fare **Nuova versione** (il backend
      `src/Code.gs` non è cambiato con la scheda Assegna, ma va allineato se non lo è già)
- [ ] Creare il trigger `onNuovoTransfer` (Da foglio di lavoro → **Al cambio**)
- [ ] Portare `precalcolaDomani` da giornaliero a **ogni ora**
- [ ] Eseguire una volta `pulisciLuoghi()` e controllare il tab `Luoghi`
- [ ] Eseguire una volta `precalcolaCatene()` per riempire `_CacheTratte`
- [ ] Archiviare il workflow n8n "Planner - Proposta Incastri" (non più usato)
- [ ] **Revocare la chiave API n8n** condivisa in chat durante l'analisi

Idee non ancora affrontate:

- `assignBatch` non ha il controllo anti-conflitto che ha `assignService`: con più utenti
  contemporanei l'ultimo salvataggio vince in silenzio
- `_CacheTratte` non scade mai (voluto: tempi senza traffico), ma se cambia la viabilità di
  una tratta va cancellata la riga a mano
- vista settimana, statistiche incassi, accesso in sola lettura per gli autisti
- la scheda Assegna lavora sul **giorno mostrato**: niente vista a due giorni come in Servizi
- «in servizio oggi» è dedotto dai servizi assegnati: se il foglio `Autisti` avesse una
  colonna con il turno vero (o le ore disponibili), il consiglio potrebbe usarla
- far scrivere a Turni v6 le sue distanze nella stessa `_CacheTratte`

Non toccare il progetto Apps Script **"Invio Notifiche Telegram"**: è un altro progetto.
