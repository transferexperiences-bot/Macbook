# Da fare — aggiornato 18/08/2026, sera

Leggi prima `CLAUDE.md` (regole, zone di autonomia, trappole n8n). Qui c'è solo la coda
di lavoro, in ordine. Ogni voce ha la prova da cui nasce: si riparte da lì, senza ripartire
da zero.

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

## 1-bis. Bozze che tornano a chiedere conferma — **FATTO il 18/08**
**Prova:** esecuzione `760661` (18/08, 23:21). Tre transfer del 19/08 per Tedi tour operator
confermati insieme; `Parse transfer` li ha scritti tutti e tre (righe **1135, 1136, 1137** del
gestionale, verificate rileggendo il foglio). Subito dopo il promemoria ha scritto «⏳ Resta 1
bozza aperta — sul gestionale non c'è» e ha rimesso il bottone *Salva* su
`TR/18082026/G5HWU5BMPTIVTWY1`, già salvato.
**Causa:** in `Aggiorna Bozze` (sezione 3) la ricevuta di `Parse transfer` (campo `rows`)
conteneva **due righe su tre** — mancava proprio quella che aveva già la tariffa (380) — e il
codice leggeva `payload_schede` **solo se la ricevuta era vuota** (`if (!provati.size)`).
Ricevuta non vuota ma incompleta → il terzo non usciva dal registro.
**Correzione (v5):** `provati` è l'**unione** di ricevuta e `payload_schede`. Resta la
protezione del 14/08 (`730335`): una citazione di un Id in prosa non è mai una prova.
**Pubblicato:** `Prenotazioni Transfer 6.0` versione `69e9744a-85e4-43a9-9e06-62532bd0e7ab`
(indietro: `481223f5-16e3-40e4-8ad4-48f61390117c`).
**Banco:** `banchi/te/banco-bozze.js` — 9/9, con la v4 ricostruita che riproduce il guasto.
**Da tenere d'occhio:** perché la ricevuta di `Parse transfer` arriva incompleta. Il campo
`rows` nasce da `Get row(s) in sheet` (`returnFirstMatch: true`) e nel turno del 760661 ha
riportato solo i due transfer arrivati **senza** tariffa. Non è stato toccato.

## 2. Codice del rientro — `f3Y46avI5O8dEnYn` — **FATTO il 18/08**
Pubblicato: `Tool - Rientro` versione `9edb3fd9-2a14-44b9-a52a-0bd22c247188`
(per tornare indietro: `restore_workflow_version` alla `cef25980-839e-4130-b975-37a32e9fa611`).
`Prenotazioni Transfer 6.0` versione `481223f5-16e3-40e4-8ad4-48f61390117c`
(indietro: `f76ac9b7-1f36-41f3-a283-af5759c57d83`).
Codice e banco nel repo: `backups/n8n/tool-rientro/trova-rientro.js`, `banchi/te/banco-rientro.js`
(39 prove, tutte verdi, con i dati veri delle esecuzioni).

Cosa è stato corretto, con le prove:
- **L'Id dell'andata usciva nei testi.** `758399` (18/08 17:39): la scheda diceva
  «↩️ Andata: 16:45 · Id TR-20260818-47a6fd0f…», il modello di `Parse transfer` ha ripreso
  quell'Id, `appendOrUpdate` fa match sull'Id → ha **aggiornato la riga 1114** invece di
  aggiungerne una: l'andata 16:45 Pietra Blu → Città di Bari di LADANOV IGOR **non esiste più**
  (ed è rimasto l'autista dell'andata, Claudio Moccia). Ora nessun Id compare più in `scheda`,
  `avvisi`, `istruzioni`, `Note` del recap: sta solo nel campo dati `id_andata_solo_riferimento`.
- **Liste lunghe di candidati.** `755902`: 4 andate da scegliere a mano con nome e destinazione
  che ne indicavano una; `758295`: 6 andate, solo 2 partivano da Pietra Blu. Ora il codice
  restringe con ora (l'andata parte prima del rientro, stesso giorno), destinazione detta e nome
  del cliente nella frase; ogni filtro entra solo se lascia almeno un candidato e viene scritto
  in `come_ho_scelto` e negli avvisi. Se restano in due o più sceglie sempre Agostino.
- **Destinazione inventata.** `755905`: `recap_da_salvare` conteneva «Per: avratere di Dashka
  Potanis» con l'avviso «✅ l'hai detta tu». Ora una destinazione presa dalla frase vale solo se
  somiglia a un posto che sul gestionale esiste (colonne Da/Per + Fornitori); altrimenti si butta,
  si usa quella dedotta e lo si dice.
- **Descrizioni degli strumenti**: `tool_rientro` ha ora la regola «nel messaggio di salvataggio
  non deve comparire nessun Id»; `cerca_servizi` dice di non essere la strada per un rientro.

## 2-bis. Guardia dentro `Parse transfer` `IkFB29XmJJXQx1a9` — **zona rossa, serve il via**
Le correzioni sopra tolgono l'Id dai testi, ma **chi scrive non si difende da solo**: `Google
Sheets1` è `appendOrUpdate` con match su `Id`, quindi qualunque testo che contenga un Id
esistente aggiorna quella riga. Difesa proposta: se il recap dice «Nuovo transfer» e l'Id
arrivato esiste già su una riga con **Da/Per/Time diversi**, non aggiornare — generare un Id
nuovo e segnalarlo. Tocca il salvataggio: non si fa senza l'ok di Agostino.

## 3. Riparazione dati sul gestionale (zona rossa — Agostino ha già dato il via il 16/08)
1. Riga `TR/07082026/SSD1XU4R9NS80YGD` → `Transfer_Per` torna **Bari Airport**
   (ora contiene «Serafini»; data 16/08, 18:30, 7 pax, volo FR5190, 140,00, Sconto in fattura).
2. Creare il **rientro** come riga nuova: **Sabbiadoro → Serafini**, 16/08, Id nuovo,
   **autista e veicolo vuoti**. *Orario ancora da chiedere ad Agostino.*
   Ordine obbligatorio: prima il ripristino, poi il rientro.
3. **Riga 1114 (18/08, zona rossa, non ancora toccata).** L'Id
   `TR-20260818-47a6fd0f-9819-4bde-acf3-9e2ef23a78bd` adesso contiene il RIENTRO
   (18:32, Città di Bari → Pietra Blu). L'ANDATA che c'era prima va rimessa come riga a sé:
   **16:45, Pietra Blu → Città di Bari, LADANOV IGOR, 3 pax, cell 17189092369, Pietra Blu,
   125,00 €, Incassare, autista Claudio Moccia**, note «L'ospite deve recarsi alla cattedrale».
   Il rientro delle 18:32 va tenuto, ma con un **Id nuovo** e **autista vuoto**
   (adesso si porta dietro Claudio Moccia, che era dell'andata).

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

## 3 — Tariffa: il prezzo lo mette il listino, non le parole del prompt  🔴 da approvare

**Prova.** Esecuzione `760628` del 18/08 alle 21:20 (Tedi tour operator, tre transfer in un
colpo): TRANSFER 1 con `Tariffa: 380`, TRANSFER 2 e TRANSFER 3 **senza nessuna riga
Tariffa**, `intent: conferma` — salvati a prezzo vuoto. In quell'esecuzione `calcola_tariffa`
non è mai stato chiamato. L'obbligo di chiamarlo vive solo nella descrizione del tool
(«Chiamalo SEMPRE prima di mostrare la scheda»): parole, e le parole il modello le salta.
Stesso guasto già in CLAUDE.md fra i verificati (`730883`).

**Rimedio, pronto e provato, non pubblicato.** Tre nodi fra `Guardia Data` e `Switch (intent)`:

```
Guardia Data → Schede senza tariffa → IF ci sono tariffe da calcolare?
                   ├─ sì → Calcola tariffa mancante (APv3ZqEizY1HnPia) → Rimetti le tariffe
                   └─ no ────────────────────────────────────────────→ Rimetti le tariffe
                                                                          → Switch (intent)
```

* `backups/n8n/prenotazioni/schede-senza-tariffa.js`
* `backups/n8n/prenotazioni/rimetti-le-tariffe.js`
* banco `banchi/te/banco-tariffe.js` — 56 casi verdi, costruiti su `760628`, `769329`,
  `769098`, `768734`.

Il prezzo entra in **tutti e tre i testi** (mostrato, Telegram, `recap_verificato`): scriverlo
solo nel messaggio vorrebbe dire mostrarlo e non salvarlo. Se il listino non copre la tratta,
la scheda resta senza prezzo e **il salvataggio si ferma**: si chiede quel prezzo e basta.

**Perché serve il via libera.** Zona rossa n. 1 (un prezzo calcolato finisce su una riga vera
del gestionale) e n. 4 (cambia come funziona un salvataggio). Da fare insieme: puntare
`Aggiorna Bozze` su `Rimetti le tariffe` invece che su `Code in JavaScript`, altrimenti il
registro delle bozze legge un intent vecchio.

**Quanto vale.** Sulle chat vere (gen-mag, 1.897 schede) il prezzo mancava nel 53% dei casi e
433 schede non sono mai più ricomparse con un prezzo. Quei numeri sono del vecchio formato —
l'export finisce il 09/05 — ma `760628` dice che il buco c'è ancora.

## 4 — Una tariffa inventata a quattro cifre su una riga vera  🔴 da approvare

**Prova.** Esecuzione `760628` → `760632` (Parse transfer) → `760644` (listino), 18/08 21:20.
Transfer `TR/18082026/RT03SZHEGW3YORCP`: **Savelletri → Polignano a Mare**, una trentina di
chilometri. Sul gestionale è finito a **1.080 €**. Il calcolo, parola per parola:

```
dettaglio.da = { prezzo: 1080, mode: 'comune+raggio', dest: 'Roma APT' }
kmGaragePickup: 520.1   kmCorsa: 519.8   kmTot: 1040.1   matchEsatto: false
```

**La catena.** La partenza era scritta come link corto di Maps (`maps.app.goo.gl/…`).

1. `Prepara Ricerche`: se il link non si risolve, ripiega su una ricerca con l'indirizzo
   ripulito — che di un link è la **stringa vuota** — più `, Italia`. Si geocodifica l'Italia
   e la partenza diventa il centro del Paese.
2. `Calcola Tariffa`: il comune viene cercato nel listino con un confronto morbido
   (`l.includes(key) || key.includes(l)`). «roma» entra dentro «roma apt» → risponde il
   prezzo dell'**aeroporto di Roma**.
3. `Applica Tariffa` (Parse transfer) segna `_route: 'conferma'` perché `matchEsatto: false`,
   ma **scrive lo stesso** la tariffa sulla riga: il `_route` serve solo a mandare un
   messaggio dopo. La riga nasce con un prezzo che non ha scelto nessuno.

Non è «tariffa mancante»: è peggio. Una tariffa mancante si vede; una tariffa inventata a
quattro cifre sembra una tariffa.

**Rimedio, pronto e provato, non pubblicato.**
`backups/n8n/calcola-tariffa/guardia-luogo.js` — tre domande prima di dare un prezzo:
il luogo si è risolto davvero; la corsa sta entro 300 km da casa; il listino ha risposto per
la tratta giusta (un comune non prende il prezzo di un posto particolare dentro quel comune:
«Roma» non è «Roma APT», «Bari» non è «Bari Airport» — il contrario sì, «Polignano a Mare»
può prendere la riga «Polignano»). Se una risponde male non esce un prezzo, esce un
`warning`: la strada che il sistema già conosce (`_route: 'zero'` → `Parcheggia Tariffa0` →
si chiede ad Agostino).

Banco `banchi/te/banco-guardia-luogo.js`, 15 casi verdi, fra cui i prezzi giusti che non si
devono muovere (Bar Rotolo → Cala Ponte 60 €) e le corse lunghe vere (Polignano → Amalfi
800 € di listino esatto: non si tocca).

**Da decidere insieme, ed è la domanda vera:** una stima non esatta deve finire sulla riga?
Oggi ci finisce e il messaggio arriva dopo. Le alternative sono parcheggiarla come si fa già
con la tariffa a zero, oppure scriverla marcata (Nota `⚠️ stima`) perché non venga scambiata
per un prezzo deciso.

**Nota su quanto è frequente.** Nel gestionale di agosto (916 righe scritte dal bot) le
tariffe vuote o a zero sono 10, l'1%: `Calcola Tariffa Gate` dentro Parse transfer il buco lo
tappa quasi sempre. Il problema non è la quantità, è che quando sbaglia sbaglia in grande e
in silenzio.

## 5 — «Non si riesce ad avere prezzi corretti»: misurato, e si può

Domanda di Agostino, 20/08 all'una di notte. Misurata sulle righe vere del gestionale
(1.101 righe con un prezzo), non a naso.

### Perché oggi sbaglia

Il listino `Generico` ha **62 destinazioni**. I transfer veri vanno in centinaia di posti che
lì dentro non ci sono: hotel, trulli, ristoranti, link di Maps. Quando il nome non c'è, il
motore **non dice «non lo so»**: ripiega su un confronto morbido fra nomi
(`nome.includes(riga) || riga.includes(nome)`) e poi sui chilometri. Da lì arrivano i numeri
assurdi, e non sono rari — sono un intero modo di sbagliare:

| quello che succede | prezzo vero | prezzo calcolato |
|---|---|---|
| «stazione» somiglia a «Stazione di Bari» | 10 € | 120 € |
| «roma» (link di Maps non risolto) somiglia a «Roma APT» | ~135 € | **1.080 €** |
| «Peschiera → Savelletri» prezzato come tratta da Polignano | 40 € | 95 € |

Quanto vale il calcolo di oggi, sulle righe vere:

* prezzo preso col nome **esatto**: azzecca il numero nel **20%** dei casi
* prezzo preso per **somiglianza**: **4%**
* tratte che il listino non copre proprio: **33%** delle righe

### Il listino che esiste già e nessuno ha scritto

I prezzi giusti ci sono: sono sulle righe che Agostino ha accettato. Raggruppando per
**fornitore + tratta (senza verso) + fascia pax**, e riportando a giorno il supplemento
notturno (×1,2 prima delle 7):

* **142 tratte** hanno sempre lo stesso prezzo → sono righe di listino pronte
* coprono il **51%** delle righe con un prezzo

Messo alla prova **onestamente** (per giudicare una riga il listino viene ricostruito senza
quella riga e senza le sue gemelle dello stesso giorno — `banchi/te/banco-listino-imparato.js`):

* risponde sul **33%** delle righe
* e quando risponde dà **il numero identico nel 93% dei casi**

Contro il 20% del calcolo attuale. Gli sbagli che restano sono da 5-10 € su corse corte che
Agostino prezza a mano di volta in volta.

### Cosa propongo

1. **Prima si guarda lo storico.** Fornitore + tratta + fascia pax: se quella corsa è già
   stata fatta almeno due volte allo stesso prezzo, quello è il prezzo. Nessun indovinello.
2. **Poi il listino del fornitore, e solo per nome esatto.**
3. **Se nessuno dei due risponde, si dice che non si sa e si chiede.** Niente confronto
   morbido, niente chilometri: è lì che nascono i 1.080 €.
4. **Il Pax vuoto si legge dal veicolo** (Sprinter = 9, Vito = 7): oggi un Pax vuoto vale 1 e
   prende la colonna più economica. Cambia la fascia sul 3% delle righe.

Il listino imparato si aggiorna da solo: ogni tratta prezzata due volte diventa una riga.

**Roba pronta:** `backups/n8n/calcola-tariffa/listino-imparato.json` (142 righe, 33 fornitori),
`banchi/te/impara-listino.js`, `banchi/te/banco-listino.js`, `banchi/te/banco-listino-imparato.js`.

**Serve il via libera** (zona rossa 1 e 2): il listino imparato va messo dove il motore lo
legge — una scheda nuova del foglio struttura, oppure una tabella dati di n8n — e il motore
va cambiato per smettere di indovinare.
