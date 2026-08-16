# Da fare — aggiornato 16/08/2026, notte

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
**Causa (confermata sul nodo):** `Pending Transfer1` è un Google Sheets `update` con
`matchingColumns: ["Id"]` sul foglio della struttura. Su una riga nuova l'Id non c'è ancora:
nessuna corrispondenza, nessuna scrittura, la riga resta senza marcatura e al rinvio riparte
tutto. Stesso difetto su `Pending Boat1`, che infatti nelle due esecuzioni ha restituito `{}`.
**Correzione:** puntare la riga **per numero** (`rowIndex` da `Code - Build ID + Telegram1`,
verificato = numero di riga vero, intestazione compresa; prova: `rowIndex 243` = `targetRow 243`
di `Smart Write Struttura`, esecuzioni `729824`/`729828`). Solo Id, mai confronti sul contenuto
(regola di Agostino: «una struttura può inserire transfer identici, comanda l'Id»).
**Stato: pronta e provata, non pubblicata.** Codice e banco in `banchi/te/`
(`node banchi/te/banco-pending.js`, 19 prove verdi, dati veri di `742784`/`729828`). Tre nodi al
posto di `Pending Transfer1`: legge le intestazioni, trova le colonne `Stato` e `Id`, scrive con
`values:batchUpdate` sulla riga giusta. **Serve il via di Agostino: zona rossa** (foglio struttura
+ come funziona un salvataggio).
**Backup:** `backups/n8n/TW_pre_dedup_20260814.json`.

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
