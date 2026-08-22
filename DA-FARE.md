# Da fare — aggiornato 22/08/2026, mattina

Leggi prima `CLAUDE.md` (regole, zone di autonomia, trappole n8n). Qui c'è solo la coda
di lavoro, in ordine. Ogni voce ha la prova da cui nasce: si riparte da lì, senza ripartire
da zero.

## ✅ Fatto il 22/08 — il registro delle bozze ora sa dire «questa è già salvata»

**Il guasto, raccontato da Agostino:** «seppur abbia confermato dei transfer prima, continui a
rimetterli in mezzo e a richiedere conferma; molti salvataggi non partono in automatico».

**Le prove, tutte del 22/08 su `NT4lxIxyBAl5lHpN`:**

| Ora | Esecuzione | Gesto | Schede spedite | Bozze rimaste |
|---|---|---|---|---|
| 09:06 | `785609` | conferma | 3 (ricevuta 3/3) | 0 |
| 09:07 | `785614` | conferma | 5 (ricevuta 5/5) | 0 |
| 09:16 | `785719` | messaggio normale | — | **7** |
| 09:27 | `785749` | «Conferma tutti» | **0** | 7 |
| 09:30 | `785765` | bottone «salva tutte» | 7 | 0 |

**Causa unica:** lo stato «questo è salvato» non esisteva. Veniva ricostruito ogni turno
leggendo il testo che il modello aveva appena scritto. Da lì i due sintomi:
1. l'agente ristampa un recap → `Aggiorna Bozze` rimette in coda **anche le schede già
   salvate** (alle 09:16 sono rientrate tutte e 5 le salvate alle 09:07);
2. il payload da spedire era ritagliato dalle schede **ristampate in quel turno**
   (`payload_origine: "turno"`). Alle 09:27 l'agente ha risposto solo «Salvataggio in
   corso...» → payload vuoto → **zero righe scritte**. Col bottone ha ristampato le 7 schede
   e si sono salvate. Stessi transfer, stesso intent: cambiava solo se il modello ristampava.

Nessun doppione e nessun dato perso: `appendOrUpdate` sull'Id ha aggiornato le stesse righe.

**Correzione (zona rossa, autorizzata da Agostino il 22/08), pubblicata:**
`versionId = activeVersionId = 627718d7-4a16-42bb-9191-48458d0ddfd1`.
- `Aggiorna Bozze` **v7**: chi è confermato dalla **ricevuta** di Parse transfer non viene più
  cancellato dal registro ma marcato `st:'salvata'`. Una ristampa identica non lo riapre; un
  cambio della **firma** dei campi sì — quella è una modifica vera. Cap contato separatamente:
  20 aperte + 30 salvate, così una lapide non spinge fuori una bozza viva.
- `Componi Payload Salvataggio`: se il modello **non ristampa nessuna scheda** e l'intento è
  `conferma`, le schede si prendono **dal registro** invece di spedire prosa al gestionale.
  Solo `conferma`, e solo le bozze **aperte**.
- La marcatura la dà **solo la ricevuta**: il testo del modello che dice «salvato» continua a
  far dimenticare la scheda, non a dichiararla salva (resta la rete del guasto `730335`).

**Banco:** `banchi/te/banco-registro.js` (guasto riprodotto + correzione) e
`banchi/te/banco-regressioni.js` (12 prove sulle reti già pagate: `730335`, `781233`, scarti,
compatibilità col registro vecchio). 19 prove su 19, fatte girare **sul codice riletto dal
server** dopo la pubblicazione.
**Backup pre-patch:** `backups/n8n/Prenotazioni_6.0_pre_registro_20260822.json`.

**Ancora da verificare in campo:** che dopo la pubblicazione il trigger Telegram sia rimasto
agganciato (trappola del 16/08) e che il primo «Conferma tutti» vero scriva davvero.

## 0. Parole sbagliate sulle bozze «spedite ma non confermate»
`Bozze - Chiedi cosa salvare` scrive **«sul gestionale non c'è»** per ogni bozza aperta, anche
per quelle marcate `da_verificare` — cioè spedite al gestionale che non le ha confermate. Lì
non si sa, e dirlo come una certezza è la stessa famiglia di «mai dichiarare un salvataggio che
non è avvenuto», al contrario. Il campo `da_verificare` esiste già nell'uscita di
`Aggiorna Bozze` e il nodo non lo legge: servono due parole diverse per i due casi.

## 0-bis. PRONTA MA NON PUBBLICATA — guardia rientro in `Parse transfer` `IkFB29XmJJXQx1a9`

**Chiesto da Agostino il 22/08:** «nel costruire i transfer di ritorno voglio la certezza che
non vengono mai più sovrascritte le andate, cioè sempre Id nuovi».

**Perché non basta quello che c'è.** `Tool - Rientro` è blindato — non stampa mai l'Id
dell'andata e lo ripete in tre regole — ma protegge solo quando il modello usa quel tool.
I due guasti sono passati lo stesso: il 16/08 (`742264`) il modello ha chiamato
`cerca_servizi` invece di `tool_rientro` e ha riusato l'Id dell'andata con `intent: modifica`;
il 18/08 (`758399`) l'Id è finito nel testo e `appendOrUpdate` ha sovrascritto l'andata delle
16:45 Pietra Blu → Città di Bari di LADANOV IGOR. In `Assegna Id` c'è ancora scritto «se l'Id
c'è, non si tocca»: un Id in arrivo viene creduto sulla parola.

**La correzione, scritta e provata, NON pubblicata.** In `Assegna Id`, prima di lasciar
passare un Id, si legge la riga che quell'Id ha davvero sul gestionale (nodo nuovo
`Leggi Riga Id (guardia rientro)`, lettura mirata sull'Id come `Get row(s) in sheet`). Se
quello che si sta per scrivere è il **percorso inverso** di quella riga, non è una modifica:
è un rientro con addosso l'Id della sua andata → Id nuovo, riga nuova. Seconda prova: il
marcatore «Rientro dell'andata delle …» che `Tool - Rientro` scrive nelle Note. Se il foglio
non risponde vale il solo marcatore.
Una modifica vera non rovescia tutti e due i capi del viaggio: orario, destinazione, tariffa e
la modifica di un rientro già salvato continuano a tenere il loro Id.

**Cosa manca per andare in produzione** (nessuna di queste è stata fatta):
1. `addNode` `Leggi Riga Id (guardia rientro)` (googleSheets 4.7, credenziale
   `N9CXGL5m4YIdjyR3`, filtro su `Id`, `returnFirstMatch`, **`alwaysOutputData: true`** — senza
   quello, quando il filtro non trova niente il nodo non emette item e `Assegna Id` non gira
   più: si fermerebbero TUTTI i salvataggi di transfer nuovi), `onError:
   continueRegularOutput`, `retryOnFail`, `maxTries 2`.
2. Ricablare `Code in JavaScript` → nodo nuovo → `Assegna Id` (togliere il collegamento
   diretto).
3. `setNodeParameter` `Assegna Id` `/jsCode` = `banchi/te/node-assegna-id.new.js`.
4. `publish_workflow`, poi rilettura dal server, diff e banco fatto girare sul codice riletto.

**Banco:** `banchi/te/banco-guardia-rientro.js` — 15 prove, guasto `758399` riprodotto sul
codice in produzione e chiuso su quello nuovo.
**Backup pre-patch:** `backups/n8n/ParseTransfer_pre_guardia_rientro_20260822.json`.

## 0-ter. PRONTE MA NON PUBBLICATE — quattro correzioni sulle bozze (v8)

Provate sul banco `banchi/te/banco-bozze-v8.js` (22 prove) piu i due banchi di stamattina
rifatti girare sul codice v8 (19 prove). **41 verdi, nessuna pubblicata.**
Backup pre-patch: `backups/n8n/Prenotazioni_6.0_pre_v8_20260822.json`
(`versionId 627718d7-4a16-42bb-9191-48458d0ddfd1`).

**A — `Inietta Storage`: REGRESSIONE della v7, la piu urgente.**
Iniettava `Object.values(map)` per intero. Dalla v7 le schede salvate restano in registro
come lapidi `st:'salvata'`, quindi da stamattina l'agente riceve **anche le schede gia sul
gestionale come se fossero bozze aperte**. E la ragione per cui Agostino ha detto «non sta
capendo qual e la bozza». Correzione: si inietta solo `st !== 'salvata'`.
File: `banchi/te/node-inietta.new.js`.

**B — schede scritte su UNA RIGA SOLA (esecuzione `788007`, 22/08 16:40).**
L'agente ha stampato le due schede del tuk-tuk cosi:
`📅 23/08/2026 · 🕐 15:30 · 📍 Polignano a Mare → 🎯 Cala Ponte Marina · … · 🆔 TR/…`
Zero righe «Campo:», e il ritaglio ne pretende almeno tre: tutte e due invisibili al codice.
Su «Salva subito» ne e partita UNA sola, e solo perche stava anche nel messaggio cliccato.
Correzione: `espandiCompatte()` riapre la riga schiacciata in righe «Campo: valore» prima di
ogni lettura, in `Aggiorna Bozze` e in `Componi Payload Salvataggio`. Il promemoria delle
bozze resta al sicuro: e compatto ma senza Id, e senza Id la funzione non tocca niente.
Misurato sui dati veri: prima 1 scheda su 2, dopo 2 su 2.

**C — richieste descritte ma senza scheda (esecuzione `787808`, 22/08 16:08).**
Richiesta vera di Davide per il 7 settembre — data, volo AF1288, cellulare, Dimora Brando.
L'agente fa le domande giuste e **non stampa nessuna scheda**: nessun Id, nessuna bozza.
Registro prima `{}`, registro dopo `{}`. Di quella richiesta non e rimasta traccia da nessuna
parte. Confronto: il tuk-tuk delle 16:34, a cui mancava solo la tariffa, e diventato bozza
perche li la scheda era stata stampata. Decideva l'impaginazione del modello.
Correzione: un blocco di almeno tre righe «Campo: valore» **senza Id** viene trattenuto come
`tipo:'richiesta'`. Non si salva mai da sola; sparisce quando arriva la scheda vera (firma =
data + volo/cellulare/nome/struttura).

**D — il promemoria non faceva capire quale bozza.**
Scriveva solo la destinazione: su un andata/ritorno le due tratte hanno gli stessi due posti
scambiati. Ora scrive `Da → Per`. E non dichiara piu «sul gestionale non c'e» per una bozza
`da_verificare`, che al gestionale c'e stata spedita davvero: li non si sa, e va detto cosi.

## 0-quater. Righe monche scritte sul gestionale — 22/08 (zona rossa, serve Agostino)

Esecuzione `788297` (22/08, 17:15). Ricevuta alla mano, due righe entrate incomplete:

| Riga | Data | Ora | Da → Per | Tariffa | Id |
|---|---|---|---|---|---|
| **1359** | sab 22 agosto | 17:45 | Sabbiadoro → **(vuoto)** | 60 | `TR/22082026/8CP5LITGZW4CBVHJ` |
| **1360** | **(vuota)** | 15:30 | Polignano a Mare → Cala Ponte Marina | 30 | `TR/22082026/P4RII6CXR7K72UVO` |

La 1359 non ha destinazione perche **la scheda dell'agente non aveva proprio la riga `🎯 Per:`**
— il dato non e mai stato raccolto. La rete del 19/08 ha funzionato (`Componi Payload` ha visto
la scheda monca, non si e fidato del ritaglio e ha spedito il testo intero), ma Parse transfer
ha scritto lo stesso. La 1360 e la tuk-tuk andata rimasta indietro alle 16:40: si e salvata
qui, ma senza data e con tariffa 30 invece di DA DEFINIRE (dal recap delle 16:34 era il 23/08).

**Da chiedere ad Agostino:** dove andava la 1359, e conferma che la 1360 va rimessa al 23/08
con tariffa DA DEFINIRE.

**Correzione da fare (non ancora scritta):** `Validate Fields` in `Parse transfer` dichiara in
testa «v3 (02/05/2026): NON scartare mai», riconosce che mancano Data / Da / Per e **le annota
soltanto**, poi scrive. La regola «non scartare mai» e giusta — non si perde un salvataggio —
ma una riga senza data o senza tratta non deve entrare in silenzio: va **trattenuta come bozza
e detta**, non scritta monca.

## 1. Doppioni dalle strutture — `Transfer webhook` `MJHTq5MksSeUhKgX`
**Prova:** 16/08, Suite 10/Giovì riga 134 (Zacche, 16/08 17:15, Monopoli Capitolo → Suite 10,
60 €) entrata due volte: esecuzioni `742784` (16:47) e `742805` (16:50). Id
`TR-20260815-260bb7e5-e32a-4869-9f43-7b9a49348b4d` (generato ieri, quindi già sulla riga).
**Da verificare per primo:** se la chiamata delle 16:47 portava lo *stesso* Id → una riga sola
scritta due volte (solo due schede Telegram); se Id diversi → due righe vere sul gestionale.
**Causa:** `Pending Transfer1` cerca la riga della struttura **per Id** per scriverci l'Id, che
su una riga nuova non esiste ancora: non trova, non scrive, la riga resta senza Id e al rinvio
riparte tutto.
**Correzione:** puntare la riga **per numero** (`rowIndex` da `Code - Build ID + Telegram1`,
verificato = numero di riga vero, intestazione compresa; prova: `rowIndex 243` = `targetRow 243`
di `Smart Write Struttura`, esecuzioni `729824`/`729828`). Solo Id, mai confronti sul contenuto
(regola di Agostino: «una struttura può inserire transfer identici, comanda l'Id»).
**Backup:** `backups/n8n/TW_pre_dedup_20260814.json`.

## 2. Codice del rientro — `f3Y46avI5O8dEnYn` (ora accessibile via MCP)
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
esecuzioni in 0,6 secondi (`742008`-`742011`).
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
  gestionale) e `k9sSAiWfJLGRbkma` *TMP prova Prenotazioni* (clone di prova attivo con Schedule
  Trigger): da spegnere. Più i warning strutturali: `Switch (kind)` e `Switch (document mime)`
  usano `rules.rules` invece di `rules.values`; `Answer Callback Query` ha `operation` non valida.

## Serve un gesto di Agostino (non aggirabile da dentro la sessione)
- **Rete:** aggiungere `transfer.app.n8n.cloud` ai domini consentiti dell'ambiente. Senza,
  il ponte non è chiamabile e le scritture sul gestionale devono passare dai bot.
- **Orario del rientro** del punto 3.2.

## Deciso da Agostino, non riaprire
- Token del ponte `Claude Bridge - Universal` lasciato al valore di default (16/08). Il rischio
  è stato spiegato: chi conosce URL e token può scrivere sul gestionale e mandare mail.
- Righe **934/935** a 55 € e **acconto −50** sulla 931: in attesa di una sua decisione.

## Il ponte (quando la rete sarà aperta)
`POST https://transfer.app.n8n.cloud/webhook/claude-bridge`, header `x-auth-token` (il valore
sta nel nodo `Auth Check` del workflow `0DVJEFcjGb8eTUmj`, **non** va committato).
Operazioni utili: `sheets_read` (`sheet_id` + `sheet_name`), `sheets_upsert` (match sull'**Id**),
`sheets_append`, `sheets_batch_append`.
