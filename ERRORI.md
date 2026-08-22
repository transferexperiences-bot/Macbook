# Tutti i guasti riscontrati — Transfer Experience

Aggiornato al **22/08/2026**. Copre i giorni 14–22 agosto 2026.
Fonte: esecuzioni n8n, righe dei fogli, esecuzioni Apps Script. Dove c'è un numero fra
apici è l'esecuzione da cui si può rileggere la prova.

---

## ✅ Chiusi e verificati

### Le parole del modello al posto del codice

| Guasto | Prova | Causa vera | Come è stato chiuso |
|---|---|---|---|
| Due transfer persi | `730335` | Id e valori composti dal modello | Id e campi generati dal codice, scelta col bottone |
| Cliente sbagliato confermato | `730664` | la conferma passava da una frase | bottone con `callback_data` costruito dal codice |
| Schede salvate senza tariffa | `730883` | `$fromAI(key, desc, type)` **senza il quarto argomento**: campo obbligatorio, se il modello lo omette salta l'intero turno | default su tutti i `$fromAI` |
| Domanda sulla data ribaltata | `739952` | testo della domanda scritto dal modello | testo generato dal codice |

**La regola che ne esce:** ogni cosa che conta — Id, prezzi, date, quali schede salvare —
deve essere prodotta da codice e scelta con un bottone.

### Salvataggi e doppioni

| Guasto | Causa vera | Chiuso |
|---|---|---|
| Doppioni dalle strutture | `appendOrUpdate` su una chiave inesistente **appende**, non aggiorna; e il dedup guardava solo le righe `PENDING`, quindi se la stessa riga era già in coda come `SENT`/`ERROR` ne appendeva un'altra | dedup corretto, chiave sull'Id |
| Modifiche dalle strutture non rilevate | confronto fatto sui valori sbagliati | pubblicata 17/08, 10:22 |
| Scheda doppia in archivio | esec. `779470`/`779472`: nel nodo `gestionale` entrano due rami (diretto + `Set Cancellato` → `Wait`) | `if ($runIndex > 0) return [];` |
| Guardia sulla scrittura del gestionale | niente fermava una scrittura incompleta | pubblicata e vista girare 17/08 |

### Prezzi

| Guasto | Prova | Causa vera | Chiuso |
|---|---|---|---|
| Cella `C1` del listino Pietra Blu a `3` | `769083` | valore vecchio: la colonna dei 9 pax leggeva la fascia sbagliata | portata a `7` e riletta dal server |
| Tariffa 0 sul listino Generico | `769636` | destinazione non nel listino e nessun ripescaggio | ripescaggio pubblicato — Pietra Blu → Alberobello da 30 € a **95 €** |
| €/km non seguiva la commissione | `772611` | moltiplicatore fisso a 1,00 per tutti | **1,00 + % fee**, arrotondato ai 10 centesimi; prezzo a km ai 5 €. Monopoli → Melograno 23:30 = **36 €** |
| Listino tuk-tuk pescato per tratte lunghe | — | regex `/tuk/` troppo larga: prendeva qualunque listino col tuk nel nome | `/listin[oi].*tuk/` |

Regole confermate da Agostino e ora nel codice: notturno **22:00–07:00**, il tuk-tuk **mai a
km** (raggio d'azione ristretto, prezzi ridotti), ore extra a 1,00 €/min + la stessa % fee.

### Fogli struttura

| Guasto | Causa vera | Chiuso |
|---|---|---|
| Colonna Data con testo (`merc 8`) | esisteva la correzione dell'**ora**, non della **data** | `canonicalData` + `correggiCellaData` nella libreria; agisce solo se la cella contiene testo, così non litiga col «tipo di colonna» di Google |
| Anno mancante nella data | — | anno corrente, o il prossimo se la data sarebbe passata da più di 30 giorni |

### Telegram

| Guasto | Causa vera | Chiuso |
|---|---|---|
| Rapporto orario illeggibile | ripeteva tutto uguale ogni ora e Telegram lo tagliava oltre i 4.000 caratteri | manda **solo le novità**, **solo le 🔴**; le minori come conteggio; silenzio quando non c'è niente. Esec. `786695`: **7 cose nuove, ~1.000 caratteri** |
| Le richieste confermate restavano in mezzo alle pendenti | un bot solo per tutto | due bot: **Richieste** (da approvare) e **Archivio** (già decise), con annullato e cancellato agganciati — `8a9b0c57` |

---

## 🔴 Ancora aperti

### 1. La conferma non torna sul foglio della struttura  *(trovato il 22/08)*
Il nodo `Google Sheets Strutture` dentro `Parse transfer` (`IkFB29XmJJXQx1a9`) punta a un
documento **fisso**:

```
documentId: 1wWn3ZGZR1biuHVevIer5QP3GKZvuDkBf9poUGsZmkyg   → foglio "Strutture"
sheetName:  Foglio1
```

Quando confermi, la riga va sul gestionale, sul foglio «Strutture» (quello unico di appoggio)
e in archivio Telegram. **Sul foglio della singola struttura non ci va mai.** Non è un guasto
di oggi: non esiste proprio un pezzo che scriva sui fogli delle strutture.

Si vede dagli Id: quelli nati sul foglio struttura sono `TR-20260421-<uuid>`, quelli nati dal
bot sono `TR/13082026/…`. Sul foglio di Pietra Blu ci sono solo i primi.

**Rimedio proposto (zona 🔴, in attesa dell'ok):** un secondo `appendOrUpdate` dopo il
salvataggio, sul foglio scelto in base al Fornitore, con lo schema loro
(`Mese · Note · Data · Time · TRS> DA · TRS <PER · PAX · Nome · Fornitore · … · Stato · Id`)
e chiave sull'`Id`. La mappa fornitore → foglio si ricava dal campo `sheet id` che il foglio
«Strutture» già porta dietro. Prima banco offline, poi **solo Pietra Blu**
(`1x258IpxTwf6bvc03sEb1RBJf8wSR5hIM3_uhFkirLCY`).

### 2. `Smart Write Struttura`, ripiego sulla riga vuota
Se non trova l'Id scrive sulla **prima riga vuota** che incontra, e riscrive **l'intera riga**
(A→Z). Su un foglio dove stanno compilando prenotazioni nuove è una mina.

### 3. `Code - Parse Callback` crasha sui bottoni del controllo
Esec. `752902`, 17/08 21:38: `"TENO|8" [line 51]`, poi `Write Target Row` → 404.
**Quel ✅ non ha fatto niente.**

### 4. Tre esecuzioni per ogni modifica sui fogli
`onEdit_completo` e `onEdit` installabili, più `onEdit` come trigger semplice: si contendono lo
stesso `LockService.getScriptLock()`. Il trigger semplice per giunta non ha i permessi per
aprire il foglio Strutture e **fallisce sempre**.
17/08, 18:10–18:11: **24 esecuzioni in 37 secondi**, una durata **88 secondi**.

### 5. Il `catch` di `onEdit` ingoia tutto
L'esecuzione risulta «Completata» anche quando la riga in coda non c'è.
**«Completata» non vuol dire che la riga è in coda.** Ogni fallimento deve diventare ERROR
più messaggio Telegram.

### 6. Colonne per numero fisso su tutte le strutture
`TransferLib` è **una sola libreria condivisa da tutti e 18 i fogli** e indirizza le colonne per
numero:

```js
const SCHEMA = { ORA_COL: 4, TELEFONO_COL: 11, FORNITORE_COL: 9, STATO_COL: 22, ID_COL: 24 };
```

Se **una** struttura inserisce una colonna, quel foglio legge Stato e Id dalle celle sbagliate.
✅ Verificato il 16/08 su tutte e 17 le strutture con la tab `Prenotazioni` (esec.
`744115`-`744134`, nessuna scrittura): oggi combaciano tutte. **È una mina, non un incendio.**

Il ripiego per posizione **sta già girando**: Covo dei Saraceni riga 115, 17/08 10:05,
`data → colonna 3 (per posizione)`.

### 7. Tre risolutori di colonne per la stessa idea
`TransferLib.buildColMap()`, `teBuildColMap_()` nel queue processor, e `cercaCol_` nel
`GESTIONALE BARCHE V4.4`. Tre tabelle di alias diverse, tre ripieghi diversi: una correzione va
incollata tre volte, e alla terza ce ne si dimentica una.

### 8. Intestazioni mai rinominate sui fogli
- **La Peschiera**: `Colonna 2` al posto di `Note`
- **Covo dei Saraceni**: `Colonna 1` al posto di `Data`
- **Agostino Tedi tour operator**: non ha proprio la tab `Prenotazioni`
- `Tariffa` e `Tariffa ` (con lo spazio) convivono; Melograno e 6 Stelle Mama non ce l'hanno

È l'unica correzione che non sta nel codice: va fatta a mano sul foglio.

### 9. Righe di coda ferme dall'8 giugno
Esec. `742784`: Melograno, Covo dei Saraceni, Suite 10/Giovì con `Status: ERROR`,
`Error: "Exception: Cannot convert '' to int."`, `LastUpdate: 08/06/2026`. È la data del
refactor: la colonna E della Queue è passata da booleano `Processing` a contatore `attempts` e
le righe vecchie ci sono rimaste dentro.

Nella stessa esecuzione `Match Fornitore Queue` ha agganciato la riga di coda **415**
(`Status: DONE`, `TR-20260502-…`, `RowNumber: 19`): un transfer del 2 maggio, non quello giusto.

### 10. Lo Stato svuotato in silenzio
Le guardie su Suite 10 (`GUARD PRONTO`) e Pietra Blu svuotano lo Stato: niente entra in coda e
nessuno se ne accorge.

### 11. Provati e mai installati
- `transferlib-recupero.gs` — la rete di sicurezza che non ripescava niente
- il censimento **Presenze** — verificato: la scheda non esiste ancora
- `TransferLib-COMPLETO.gs` — il file intero da incollare (data + presenze + tendina + accoda)

### 12. Token dei bot in chiaro
Stanno dentro gli URL dei nodi HTTP. Vanno spostati in credenziali n8n — e **mai** committati
in un backup di workflow.

---

## Decisioni sui prezzi ancora aperte

- supplemento dal centro solo per 18 comuni
- il listino Pietra Blu ha **11 destinazioni**: il ripescaggio tampona, le tratte vere andrebbero messe
- la colonna `€/min` che contiene un €/km fermo a 1,0
- il notturno vecchio (`hh < 7`) nel nodo `Applica listino imparato`

---

## Errori miei, per onestà

**Lettore xlsx bacato.** Il regex `<c ([^>]*?)/?>(?:(.*?)</c>)?` non gestiva le celle
self-closing: le celle vuote facevano scivolare le colonne. Per questo ti ho detto una cosa
**falsa** — che «Listini Tuk-tuk» conteneva i €/km e che «€/min» era vuota: era l'esatto
contrario. Corretto in `<c ([^>]*?)(?:/>|>(.*?)</c>)`, e la versione sbagliata è rimasta in
`REGOLE.md` sotto un `<details>` perché si veda cosa era successo.

**Modifica non pubblicata.** Avevo aggiunto il bottone all'archivio e l'avevo provato a mano —
ma la prova manuale usa la **bozza**: in produzione girava ancora la versione senza bottone.
Da lì la regola: dopo `update_workflow` sempre `publish_workflow`, e se
`versionId ≠ activeVersionId` gira ancora la versione vecchia. Poi si rilegge il nodo dal
server e si fa il diff.

**Due prove di banco sbagliate** (`teCorto_` sulla lunghezza, `indexOf(...) === 0`): erano le
prove a essere sbagliate, non il codice. Corrette le prove.

**Fixture infedele.** Avevo eliminato le chiavi vuote, ma il nodo Google Sheets le tiene come
stringhe vuote: rigenerata fedele.

---

## Le trappole n8n imparate a caro prezzo

- una modifica **non pubblicata** non è in produzione
- `$fromAI` senza default = campo obbligatorio = turno saltato
- `appendOrUpdate` su chiave inesistente **appende**
- `setNodeParameter` con un JSON Pointer **non scende dentro gli array**: per quelli
  `updateNodeParameters` con `replace: true`
- `callback_data` di Telegram: massimo **64 byte**
- locale italiano: i decimali vogliono la **virgola**
