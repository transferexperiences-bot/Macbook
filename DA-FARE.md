# Da fare — aggiornato 17/08/2026, mattina

## ✅ CHIUSO — i doppioni dalle strutture (era il punto 1)

Installato e verificato il 17/08. Il progetto Apps Script *Transfer Queue Processor*
(`1JPUJQRac9_W78r5L3nDILLcvxVfU05dMAEn1qh0CHci_SbNjMoczzrUs`) e `TransferLib`
(`1vo74eNOp7bRgiU-ioVRTRCfb2k9rmDVlV5lmW_DoFKTTKZM_or7K0o96`) girano il codice nuovo —
controllato scaricando i sorgenti, non a parole. Codice e banchi in `apps-script/` e `banchi/te/`.

**Quattro guasti chiusi:**
1. **Doppioni.** `MAX_VERIFY_MS` da 6000 a 30000: n8n scrive l'ack al secondo ~13, la finestra
   si chiudeva a 6. Regressione dell'8 giugno. Verificato sul campo: invii `744830` (16/08
   21:23) e `747324` (17/08 07:33), nessun rinvio.
2. **Colonne per numero fisso.** Ora per nome, tolleranti su accenti/spazi/punteggiatura, senza
   mai confronti «somiglia a» — `Tariffa` non può rubare `Tariffa a noi`.
3. **RowNumber preso per buono.** Ora la riga si conferma cercando l'Id; se non c'è, ERROR e non
   si manda niente.
4. **Rinvii invisibili.** Righe che `Filter1` scarta (stato `Confermato`) non ricevevano mai
   l'ack e ripartivano ogni 90 s senza produrre schede: dodici chiamate a vuoto fra le 06:31 e
   le 06:40 del 17/08. Ora si riproduce il filtro di n8n prima di mandare. Il ciclo si è fermato
   alle 07:47.

**In più:** corretto un difetto della v1 di `normalizeOra` (gli orari con virgola tipo `21,15`
non venivano mai normalizzati) e l'attivatore programmato su `installAllTimerTriggers`, che a
ogni giro cancellava e ricreava il timer del lavoratore.

**Resta da fare, roba di minuti:**
- lanciare **`sistemaCodaVecchia`** dal Queue Processor: al 17/08 08:06 le sei righe rotte
  dall'8 giugno erano ancora `ERROR` con data `16/08 21:25`. Sono ferme, non fanno danno, ma
  vanno archiviate;
- rinominare `Colonna 2` → `Note` su **La Peschiera** e `Colonna 1` → `Data` su
  **Covo dei Saraceni** (vedi punto 1-bis);
- `diagnosticaIntestazioni()` quando si vuole il quadro delle 18 strutture.

**Idea aperta (Agostino, 17/08):** un progetto unico che chiami tutte le strutture, invece di
uno stub su ogni foglio. Metà c'è già (`TransferLib`). La centralizzazione piena del *lavoro*
però sfonda la quota: ~40 min/giorno per file × 18 ≈ 12 ore, contro un limite di 90 minuti al
giorno per script su account gratuito. Centralizzabile semmai l'`onChange` (max 20 trigger per
script). Serve prima vedere uno stub di una struttura: non è leggibile da fuori.

---

# Coda precedente — aggiornato 16/08/2026, notte

Leggi prima `CLAUDE.md` (regole, zone di autonomia, trappole n8n). Qui c'è solo la coda
di lavoro, in ordine. Ogni voce ha la prova da cui nasce: si riparte da lì, senza ripartire
da zero.

## 1. Doppioni dalle strutture — `Transfer webhook` `MJHTq5MksSeUhKgX`
**Prova:** 16/08, Suite 10/Giovì riga 134 (Zacche, 16/08 17:15, Monopoli Capitolo → Suite 10,
60 €) entrata due volte: esecuzioni `742784` (16:47) e `742805` (16:50). Id
`TR-20260815-260bb7e5-e32a-4869-9f43-7b9a49348b4d` (generato ieri, quindi già sulla riga).
**✅ Verificato il 16/08 (era la prima cosa da fare):** le due chiamate portavano lo **stesso Id**
`TR-20260815-260bb7e5-…`. Quindi **nessun doppione sul gestionale**: una riga sola (`row_number`
4375) riscritta due volte, e due schede Telegram (`message_id` 5343 e 5344). Il danno è rumore
su Telegram, non transfer duplicati.
**Nota a margine, dalla stessa prova:** in `742784` la riga 4375 è passata da `Time: ""` a
`17:15`, ma `Code in JavaScript2` ha calcolato `changes: []` e `hasChanges: false`. Il rilevatore
di modifiche non vede il campo orario → *vedi punto 8*.
### ⛔ CAUSA VERA — trovata negli Apps Script, non in n8n

Due ipotesi precedenti sono **sbagliate** e vanno abbandonate:
- ~~«sulla riga nuova l'Id non c'è ancora, quindi l'update per Id non trova»~~ — falso: l'Id
  era sulla riga, arrivava nel corpo della chiamata.
- ~~«puntare la riga per numero»~~ — **da non fare mai** (regola di Agostino: se l'ordine
  cambia è la fine; sempre e solo Id univoco).

**Chi manda:** `processQueue()` nel progetto Apps Script *Transfer Queue Processor v2*
(`1JPUJQRac9_W78r5L3nDILLcvxVfU05dMAEn1qh0CHci_SbNjMoczzrUs`), legato al file centrale
`Strutture` (`1wWn3ZGZR1biuHVevIer5QP3GKZvuDkBf9poUGsZmkyg`, tab `Foglio1` e `Queue`),
timer ogni minuto.

```js
const MAX_VERIFY_MS   = 6000;   // aspetta l'ack solo 6 secondi
const RESEND_AFTER_MS = 90000;  // poi rimanda dopo 90 secondi
const MAX_ATTEMPTS    = 6;
```

Dopo il POST, se la risposta è 2xx, rilegge la cella `Stato` della riga struttura una volta al
secondo per **6 secondi**, cercando `": Pending"`. Se non lo vede: segna `SENT` e **rimanda**.

**Ma n8n quel `": Pending"` lo scrive al secondo ~13.** Nell'esecuzione `742784`:
`Pending Transfer1` parte **5,19 s** dopo l'arrivo della chiamata e dura **8,18 s** → atterra a
**~13,4 s**. La finestra si era chiusa a 6 s. La scrittura c'era, Apps Script aveva già smesso
di guardare. Riscontro sui tempi: 16:47:20 → 16:50:20, esattamente due giri da 90 s.

**È una regressione.** Nello stesso file c'è `processQueue_BACKUP()`, marcata
«backup pre-refactor 2026-06-08», che usava `MAX_WAIT_SECONDS = 30`. Il refactor dell'8 giugno
ha portato l'attesa da 30 s a 6 s: da lì i doppioni sono diventati la norma, non l'eccezione.

**Correzione (due strade, meglio tutte e due):**
1. **n8n:** far scrivere `Pending Transfer1` **per primo**, subito dopo
   `Code - Build ID + Telegram1`, invece che dopo Telegram e gestionale. Passa da ~13 s a ~1 s.
2. **Apps Script:** riportare `MAX_VERIFY_MS` a 30000 come prima del refactor.

La 1 sta in n8n e non tocca gli script delle strutture. La 2 è una riga sola ma è codice che
gira su tutte le strutture. Entrambe **zona rossa**: serve il via.

**Da NON fare:** il banco `banchi/te/` scriveva per numero di riga. Regola violata, buttato.
Resta solo come banco (rigioca dati veri di `742784`/`729828`), non come correzione.

**Backup:** `backups/n8n/TW_pre_dedup_20260814.json`.

## 1-bis. Colonne fisse per numero su tutte le strutture (fragilità di sistema)
`TransferLib` (`1vo74eNOp7bRgiU-ioVRTRCfb2k9rmDVlV5lmW_DoFKTTKZM_or7K0o96`) è **una sola
libreria condivisa da tutti e 18 i file struttura**, e indirizza le colonne per numero fisso:

```js
const SCHEMA = { ORA_COL: 4, TELEFONO_COL: 11, FORNITORE_COL: 9, STATO_COL: 22, ID_COL: 24 };
```

Stessa cosa in `processQueue()`: `getRange(rowNumber, 22)` per lo Stato e `sourceRow[23]` per
l'Id. Se **una** struttura inserisce una colonna, quel file legge Stato e Id dalle celle
sbagliate — e il codice è lo stesso per tutti.

**✅ Verificato su tutte, il 16/08** (`sheets_read` del ponte da dentro n8n, esecuzioni
`744115`-`744134`, nessuna scrittura): su **tutte e 17** le strutture con la tab `Prenotazioni`
lo Stato è alla 22 e l'Id alla 24. **Il guasto non è in atto**: è una mina, non un incendio.
Quadro completo in `apps-script/README.md`. Tre cose emerse dai dati:
- `Tariffa` e `Tariffa ` (con lo spazio) convivono: quasi tutte ce l'hanno, Melograno e
  6 Stelle Mama no.
- **La Peschiera** ha `Colonna 2` al posto di `Note`, **Covo dei Saraceni** ha `Colonna 1` al
  posto di `Data`: intestazioni generiche di Google mai rinominate. Da sistemare a mano sul
  foglio — è l'unica correzione che non sta nel codice.
- **Agostino Tedi tour operator** non ha proprio la tab `Prenotazioni`: se è ancora
  nell'elenco delle strutture attive va tolto o sistemato.

Il modo giusto è già in casa: `GESTIONALE BARCHE V4.4`
(`1rF0UF5s0AHafDeBocGdyyLVhO6UQZBfFw8Re35eLr29EoPKhcr-2iMYP`) scrive sullo **stesso** webhook
ma risolve le colonne **per nome** con un `colMap`.

## 1-ter. Righe di coda ferme dall'8 giugno
In `Get Fornitore Sheet ID1` (esecuzione `742784`) più strutture — Melograno, Covo dei Saraceni,
Suite 10/Giovì — sono `Status: ERROR`, `Processing: 6`,
`Error: "Exception: Cannot convert '' to int."`, `LastUpdate: 08/06/2026`. È la data del
refactor: la colonna E della Queue è passata da booleano `Processing` a contatore `attempts`, e
le righe vecchie ci sono rimaste dentro. Da ripulire.

Inoltre `Match Fornitore Queue` nella stessa esecuzione ha agganciato la riga di coda **415**
(`Status: DONE`, `TransferId: TR-20260502-…`, `RowNumber: 19`): un transfer del 2 maggio, non
quello di Zacche. Da aprire a parte.

## 2. Codice del rientro — `f3Y46avI5O8dEnYn` ⛔ BLOCCATO: **non** accessibile via MCP
**Correzione alla riga di ieri:** `Tool - Rientro` risulta `availableInMCP: false`. Non è
leggibile né modificabile da qui: `get_workflow_details` risponde «Workflow is not available in
MCP». Il codice delle tre regole qui sotto non si può scrivere finché Agostino non attiva
l'accesso MCP dalla scheda del workflow.
**Prova:** esecuzione `742264` del 16/08 15:31 — una richiesta di rientro è diventata la
**modifica dell'andata**: chiamato `cerca_servizi` invece di `tool_rientro`, riusato l'Id
`TR/07082026/SSD1XU4R9NS80YGD` con `intent: modifica`, ereditati autista (Giovanni Vito
Antonio) e veicolo. La scrittura è avvenuta davvero (`Parse transfer` esecuzione `742281`).
**Fatto finora:** riscritte le regole nella descrizione di `tool_rientro` dentro Prenotazioni.
Non basta: vanno messe nel codice.
1. Rientro = **sempre riga nuova con Id nuovo**, mai `intent: modifica`.
2. **Autista e veicolo vuoti** salvo conferma esplicita di Agostino in quel momento.
3. La **destinazione detta da Agostino vince** su quella dedotta dall'andata.

## 3. Riparazione dati sul gestionale (zona rossa — Agostino ha già dato il via il 16/08)
1. Riga `TR/07082026/SSD1XU4R9NS80YGD` → `Transfer_Per` torna **Bari Airport**
   (ora contiene «Serafini»; data 16/08, 18:30, 7 pax, volo FR5190, 140,00, Sconto in fattura).
2. Creare il **rientro** come riga nuova: **Sabbiadoro → Serafini**, 16/08, Id nuovo,
   **autista e veicolo vuoti**. *Orario ancora da chiedere ad Agostino.*
   Ordine obbligatorio: prima il ripristino, poi il rientro.

## 4. Buffer messaggi su Orca — `UAz4R93BWh9VuLiR`
Orca **non ha nessun buffer**: N messaggi = N risposte. Prova: 16/08 14:38:33, quattro
esecuzioni in 0,6 secondi (`742008`-`742011`). **Confermato anche sul disegno:** nei 113 nodi di
Orca non c'è **nessun** nodo `dataTable` e **nessun** nodo `wait` — non c'è proprio la coda.
Portare il disegno già collaudato su Prenotazioni (coda su data table, parla l'ultimo, gli
allegati vanno sempre avanti, i bottoni restano fuori), con una coda propria.

## 5. Finestra del buffer più lunga per i messaggi inoltrati (tutti e due i bot)
Con 8 secondi il caso vero non viene mai preso: inoltrando a mano i messaggi distano 20-30
secondi (prove del 16/08: coppie a 27 s). Telegram dice se un messaggio è inoltrato: per quelli
finestra ~45 s, per quelli scritti a mano resta 8-10 s.

## 6. Guardia sui trigger Telegram muti
Il 16/08 le ripubblicazioni di Orca hanno staccato il webhook: una foto è andata persa senza
lasciare traccia (nessuna esecuzione). Ripubblicare ha riagganciato.
Serve: **verificare il trigger dopo ogni pubblicazione**, e un controllo periodico che avvisi
se un bot non riceve niente da troppo tempo.

## 7. Analisi — blocchi ancora da aprire
- **B — prompt di Orca:** `__CORE` (51.792 caratteri) + i 6 moduli condizionali in
  `Unisci memoria`. Verificare che nessun modulo su **salvataggi o prezzi** sia condizionale
  (precedente: una modularizzazione sbagliata fece salvare «Tariffa DA DEFINIRE»).
- **C — giro del salvataggio di Prenotazioni:** `Parse transfer` (ora accessibile via MCP),
  `Update Tariffa`, `Update Cancella`. Aperto: **acconto scritto negativo** (riga 931: `-50`
  a fronte di «Acconto: 50» sulla scheda).
- **D — pulizia:** `eUpmRVvLs22jXVqG` *parse_transfer* (attivo, 0 esecuzioni, scrive sul
  gestionale) e `k9sSAiWfJLGRbkma` *TMP prova Prenotazioni* (clone di prova attivo, 2 trigger):
  da spegnere — **zona rossa**, serve il via. Nota: `TMP prova Prenotazioni` ha anch'esso
  `availableInMCP: false`, quindi da qui non è spegnibile.
  I tre warning strutturali sono stati aperti, ed è andata così:
  - `Switch (kind)` e `Switch (document mime)`: **falsi allarmi, niente da fare.** Sono
    `typeVersion 2`, dove `rules.rules` con `value1`/`value2` è la forma **giusta**; `rules.values`
    è la forma della v3. Riscontro nello stesso workflow: `Switch (intent)` è `v3.2` e usa
    correttamente `rules.values`. Il validatore li confronta con lo schema v3.
  - `Answer Callback Query`: **difetto vero, ma innocuo per i salvataggi.** Ha
    `operation: answerCallbackQuery` senza `resource`, quindi ricade su `resource: message`, dove
    quell'operazione non esiste (le uniche valide sono `resource: callback` →
    `answerQuery` / `answer_inline_query`). Il nodo ha `onError: continueRegularOutput` +
    `alwaysOutputData`, quindi fallisce in silenzio e il flusso prosegue: nessun dato perso, ma
    la rotellina dei bottoni Telegram non si spegne mai. Correzione: `resource: callback`,
    `operation: answerQuery`.

## 8. Modifiche dalle strutture non rilevate — `Transfer webhook` `MJHTq5MksSeUhKgX`
**Prova:** esecuzione `742784` del 16/08. `Get original transfer1` legge la riga 4375 con
`Time: ""`, la struttura manda `ora: "17:15"`, la riga viene riscritta con 17:15 — ma
`Code in JavaScript2` produce `changes: []`, `hasChanges: false`, `isNewTransfer: false`. La
scheda Telegram è partita come «🟢 NUOVO TRANSFER» invece che come modifica, e il confronto non
ha visto un cambio d'orario su un transfer di quel giorno stesso. Da aprire: il rilevatore di
modifiche in `Code in JavaScript2`.

## Serve un gesto di Agostino (non aggirabile da dentro la sessione)
- **Rete:** aggiungere `transfer.app.n8n.cloud` ai domini consentiti dell'ambiente. Senza,
  il ponte non è chiamabile e le scritture sul gestionale devono passare dai bot.
- **Accesso MCP** (interruttore sulla scheda del workflow) per `f3Y46avI5O8dEnYn`
  *Tool - Rientro* — senza, il punto 2 non parte — e per `k9sSAiWfJLGRbkma`
  *TMP prova Prenotazioni*, che va spento (punto 7D).
- **Orario del rientro** del punto 3.2.
- **Via libera in zona rossa** per pubblicare la correzione del punto 1 (già provata sul banco).

## Deciso da Agostino, non riaprire
- Token del ponte `Claude Bridge - Universal` lasciato al valore di default (16/08). Il rischio
  è stato spiegato: chi conosce URL e token può scrivere sul gestionale e mandare mail.
- Righe **934/935** a 55 € e **acconto −50** sulla 931: in attesa di una sua decisione.

## Il ponte (quando la rete sarà aperta)
`POST https://transfer.app.n8n.cloud/webhook/claude-bridge`, header `x-auth-token` (il valore
sta nel nodo `Auth Check` del workflow `0DVJEFcjGb8eTUmj`, **non** va committato).
Operazioni utili: `sheets_read` (`sheet_id` + `sheet_name`), `sheets_upsert` (match sull'**Id**),
`sheets_append`, `sheets_batch_append`.
