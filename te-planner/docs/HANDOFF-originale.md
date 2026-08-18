# TE Planner — Handoff completo

Documento di passaggio per riprendere il lavoro su un altro computer.
Ultimo aggiornamento: 30 luglio 2026.

---

## 1. Cos'è

Web app mobile (Google Apps Script) per organizzare i transfer di **Transfer Experience**.
Legge e scrive direttamente sul gestionale Google Sheets **"Programma Autisti 2.0"**
(`1nqmt8_4Oy8paHlPU8LTBLEvl-quW0DYgTtmB73nBxPw`), tab `Prenotazioni NCC 3.0`.

Serve a: vedere i servizi del giorno a colpo d'occhio, assegnare autisti e mezzi evitando
sovrapposizioni, capire quando un autista/mezzo si libera, e far partire le notifiche ai driver.

---

## 2. Dove vive il codice

**Progetto Apps Script: "TE Planner"** su script.google.com (account transfer.experiences@gmail.com).
Due file:

| File | Contenuto |
|---|---|
| `Codice.gs` | Backend: lettura foglio, calcolo durate/incastri, scritture, notifiche, precalcoli |
| `Index` (HTML) | Interfaccia mobile: liste, dettaglio servizio, flotta, timeline, rent |

**Deploy:** Esegui il deployment → App web → Esegui come: Me · Accesso: Solo io.
⚠️ Dopo ogni modifica al codice serve **Gestisci i deployment → ✏️ → Versione: Nuova versione**,
altrimenti l'URL continua a servire la versione vecchia.

⚠️ NON confondere con il progetto **"Invio Notifiche Telegram"**, che contiene altri script
(allert, promemoria, correzioni) e non va toccato.

---

## 3. Cosa fa la app (funzioni attive)

**Tab Servizi**
- Vista **righe colorate** (default) o **card** — interruttore ▤/≡
- Colore per autista; rosso = manca autista; ambra = manca mezzo; rosso scuro = manca tutto; grigio barrato = cancellato
- Filtri **Tutti / Da fare / Svolti**; ordinamento per **Orario / Autista / Fornitore / Scoperti prima**
- Riepilogo giornata: n° servizi, quanti scoperti, incasso totale
- Chip dei **giorni scoperti** dei prossimi 7 giorni (tocchi e ci vai)
- Su ogni riga senza autista: **candidato consigliato** già calcolato, un tocco per assegnarlo
- Azioni rapide: 📞 chiama · 💬 WhatsApp · 🗺️ Maps

**Dettaglio servizio** (tocco su una riga)
- Menù **Autista** (Consigliati / Disponibili / Occupati forzabili / Non disponibili con motivo)
- Menù **Veicolo** (Disponibili e adatti / Occupati / Capienza insufficiente / Fuori servizio o a noleggio)
- Campi modificabili sempre aperti: data, ora, Da, Per, pax, cliente, volo, fornitore, cellulare, tariffa, acconto, modalità, h extra, note
- Pulsanti: 📣 Invia · ✏️ Modifica · 📋 Recap · 🔕 No · ✅ Eseguito · 🗑 Cancella (soft delete)

**Salvataggio a lotti**: il 💾 Salva del dettaglio mette la modifica *in sospeso* (icona 🕐);
dalla barra gialla in alto: **💾 Salva tutto** o **📋 Salva + Recap**.

**Tab Flotta**: stato di ogni autista/mezzo con countdown "si libera tra…" e programma della giornata.
**Tab Timeline**: barre orarie con servizio (pieno), trasferimento (semitrasparente), attesa (grigio), linea rossa "adesso".
**Tab Rent**: noleggi attivi nella data; i mezzi a noleggio non sono selezionabili.

---

## 4. Architettura dei tempi (la parte importante)

Tre attori, ognuno con un compito solo:

1. **Risolvi Luogo (n8n, già esistente)** — l'unico che chiama Google Places. Riempie il tab `Luoghi`
   con le coordinate. La app NON lo invoca mai.
2. **Precalcolo (Apps Script)** — l'unico che chiama Google Maps. Calcola e salva in `_CacheTratte`:
   - durata di ogni servizio (Da→Per ×1,3 + h extra) → tempi di fine precisi
   - tratte drop-off→pickup tra servizi dello stesso giorno → catene
   - rientro alla base (Polignano) da ogni drop-off
   È **idempotente**: salta ciò che è già in cache.
3. **La app** — non chiama nessuno: legge valori pronti. Per questo si apre veloce.

**Regola di fattibilità** (identica a Turni v6, verificata sul codice):
`fine servizio A + trasferimento A→B + buffer ≤ inizio servizio B`
Buffer: 15 min · 10 se vicini (<5 km o <10 min) · 0 se stesso luogo.

**Delta / rientro al garage:** default = trasferimento diretto (l'autista NON rientra tra un servizio
e l'altro); il rientro alla base è calcolato e disponibile per l'ultimo servizio della giornata.
Decisione presa: niente delta fisso, si usa sempre il tempo reale della coppia.

---

## 5. Trigger da avere nel progetto TE Planner

| Funzione | Tipo | Quando | Stato |
|---|---|---|---|
| `precalcolaDomani` (chiama `precalcolaCatene`) | Basato sull'ora | **ogni ora** | creato, era giornaliero → da portare a orario |
| `onNuovoTransfer` | Da foglio di lavoro → **Al cambio** | a ogni inserimento/modifica | **DA CREARE** |

Da eseguire **una tantum** dal menù funzioni:
- `pulisciLuoghi()` — deduplica il tab Luoghi (i doppioni finiscono in `_LuoghiDuplicati`, nascosto)
- `precalcolaCatene()` — riempie subito la cache tratte

---

## 6. Cosa è stato fatto su n8n (istanza https://transfer.app.n8n.cloud)

**Modifiche reali applicate:**

1. **"Promemoria Autisti 4"** (`b8dTKib8sl2bYByt`) — modificato il nodo Code **"Gate Hide Istantaneo"**:
   aggiunto bypass `force`. Se il payload contiene `data.force === true` (cioè arriva dalla app),
   la notifica parte anche con `Hide = TRUE`. I flussi automatici restano bloccati come prima.
   Versione pubblicata: `93cc0ce5-26e7-40f2-9792-a56b63207de4`.

2. **"Planner - Proposta Incastri"** (`MFXUuKaStzqGsFiW`) — workflow **creato da zero** con webhook
   `POST /webhook/planner-incastri` (header `x-planner-token`) e agente Claude per proporre incastri.
   ⚠️ **Ora NON è più usato**: il pulsante Proposta è stato rimosso dalla app.
   Si può archiviare/disattivare senza conseguenze.

**Workflow usati dalla app (non modificati):**
- `POST /webhook/autista-onchange` → propaga autista/mezzo ai gestionali delle strutture
- `POST /webhook/8493d199-fcc6-425d-bce5-bf8c0a6c7292` → **Promemoria Autisti 4**, notifica immediata
  al driver (`delay_seconds: 0`, `data.allert` = Invia | Modificato | Cancellato | Recap, `force: true`)

**Nota:** il soft delete della app replica esattamente quello di Telegram: `Allert = "Cancellato"`
+ `Note += "Cancellazione gg/mm/aaaa hh:mm"`. La riga non viene mai eliminata.

**Chiave API n8n:** ne è stata condivisa una in chat durante l'analisi — **va revocata**
(n8n → Settings → n8n API) se non è già stato fatto.

---

## 7. Decisioni prese (per non rimetterle in discussione)

- Web app standalone su Apps Script (non artifact), accessibile da telefono via URL `/exec`
- Vista righe colorate stile foglio, con separatori mattina/pomeriggio/sera
- Il 💾 Salva accumula; si scrive tutto insieme dalla barra in alto
- I pulsanti allert **salvano e notificano in un tocco**, senza conferme
- Mezzi occupati: selezionabili con avviso (non bloccati), tranne fuori servizio e a noleggio
- Niente pulsante "Proposta": le catene devono essere **sempre pronte** e i consigliati visibili in riga
- Precalcolo all'inserimento + ogni ora (scelta esplicita: tempi precisi subito)
- Base unica: Polignano a Mare

---

## 8. Cose aperte / prossimi passi

- [ ] Incollare Codice.gs e Index aggiornati nel progetto, salvare, **Nuova versione** del deployment
- [ ] Creare il trigger `onNuovoTransfer` (Al cambio) e portare `precalcolaDomani` a **ogni ora**
- [ ] Eseguire `pulisciLuoghi()` una volta e controllare il tab Luoghi
- [ ] Eseguire `precalcolaCatene()` una volta per riempire la cache
- [ ] Archiviare il workflow n8n "Planner - Proposta Incastri" (non più usato)
- [ ] Revocare la chiave API n8n condivisa in chat
- [ ] Da valutare: far scrivere a Turni v6 le sue distanze nella stessa cache `_CacheTratte`
      (eviterebbe doppi calcoli; richiede di toccare un workflow in produzione)
- [ ] Da valutare: vista settimana, statistiche incassi, accesso in sola lettura per gli autisti

---

## 9. Tab tecnici creati sul foglio

| Tab | Visibile | Contenuto |
|---|---|---|
| `_CacheTratte` | nascosto | chiave "v2\|da\|\|\|per" → minuti, km, data calcolo |
| `_Log` | nascosto | ogni modifica fatta dalla app: quando, azione, id, prima/dopo |
| `_LuoghiDuplicati` | nascosto | backup dei doppioni rimossi da `pulisciLuoghi()` |
| `_Precalcolo` | opzionale | Id, durata_min, lat/lng da e per, rientro_min (se un domani lo popola n8n) |

---

## 10. Come riprendere su un altro Mac

1. Copia questa cartella (HANDOFF + Codice.gs + Index.html) sul nuovo computer.
2. Apri Cowork e allega i tre file in una nuova conversazione, dicendo:
   *"Riprendiamo il TE Planner, qui trovi handoff e file attuali"*.
3. Assicurati che sul nuovo Mac siano connessi: Google Drive e, se serve toccare i workflow, n8n.
4. Il progetto Apps Script è sul cloud (script.google.com): si apre da qualsiasi computer
   con l'account transfer.experiences@gmail.com, non va copiato.
