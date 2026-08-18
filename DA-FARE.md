# Da fare — aggiornato 18/08/2026, mattina

## 🔴 LA CAUSA VERA — la corsa sull'Id fra i tre `onEdit` (18/08, ore 16:35)

La diagnosi di Pietra Blu, lanciata da Agostino:

```
── TRIGGER INSTALLATI ──
  onEdit_completo  —  ON_EDIT
  onEdit           —  ON_EDIT
libreria TransferLib importata: no
```

Due trigger installabili, più il trigger semplice `onEdit` che Google fa partire da solo perché
la funzione si chiama così: **tre esecuzioni per ogni modifica**, come già si vedeva nella
pagina Esecuzioni del 17/08 — 24 esecuzioni in 37 secondi.

### Il difetto

`onEdit` legge la riga — Stato e Id compresi — **prima** di prendere il lock:

```js
const rangeData = sheet.getRange(...).getValues();   // <-- legge qui
...
queueLock.waitLock(10000);                           // <-- si sincronizza qui
```

Il lock non protegge niente. Quando la seconda esecuzione entra ha in mano una fotografia
vecchia: se lì l'Id era vuoto, ne conia uno nuovo e **sovrascrive quello appena scritto
dall'altra**. L'Id finito in coda non esiste più nella colonna Id, e un minuto dopo:

```
Id TR-… non trovato nella colonna Id di Pietra Blu — non mando niente
```

che è **l'errore più frequente di tutta la coda**. Il transfer non parte, e nessuno lo sa.

### E combacia con quello che vede Agostino

«Ho rimesso io Pronto ed è arrivato.» La prima volta — riga nuova, cella Id vuota — le tre
esecuzioni si rubano l'Id a vicenda. La seconda volta l'Id nella cella **c'è già**: nessuno lo
conia, nessuna corsa, il transfer parte.

Banco: `node banchi/te/banco-corsa-id.js`, verde su 7 prove, con il codice vero di `onEdit` e
il diario delle operazioni in ordine — si legge nero su bianco che la lettura precede il lock.

### ⚠️ Correzione a quello che avevo scritto stamattina

Avevo detto che il colpevole più probabile era la guardia incasso che svuota lo Stato. È un
guasto vero e la correzione serve, **ma non è questo il caso di Agostino**: la corsa sull'Id
lo spiega meglio e spiega anche perché la seconda volta funziona.

E soprattutto: **`transferlib-recupero.gs` non protegge Pietra Blu.** Lì `sweepCheck` non è
installato e `TransferLib` non è nemmeno importata — la rete di sicurezza che ho riscritto su
quel foglio non esiste proprio. Va prima installata.

### Cosa fare, in ordine

1. **rileggere Stato e Id dentro il lock**, non prima — tre righe spostate;
2. **togliere il trigger doppio**: da tre esecuzioni per modifica a una;
3. **installare `TransferLib` + `sweepCheck`** sui fogli che non ce l'hanno, così esiste una
   rete di sicurezza anche lì.

E prima di decidere dove: **lanciare `diagnosticaFoglio` su ogni foglio**. Pietra Blu era il
primo referto; senza gli altri non si sa chi ha cosa.

## 🔎 DA LANCIARE FOGLIO PER FOGLIO — la diagnosi che dice quali sono i «determinati fogli»

Agostino, 18/08 pomeriggio: «penso che sia su determinati fogli, ad esempio ho rimesso io
Pronto ed è arrivato». Ha ragione a sospettarlo, e c'è un meccanismo che lo spiega:

**la struttura mette `Pronto` mentre la riga è ancora incompleta** — manca la modalità, o la
tipologia incasso, o la tariffa non è ancora calcolata. Scatta la guardia (`incassare_` su
Pietra Blu, `GUARD PRONTO` su Suite 10), **lo Stato viene svuotato in silenzio**, niente entra
in coda. Più tardi arriva Agostino, la riga ormai è completa, rimette `Pronto` → passa.

Da fuori sembra «a volte sì a volte no». È invece: riga incompleta = cancellata di nascosto,
riga completa = passa. E cambia da foglio a foglio perché **i fogli hanno guardie diverse**.

Ma «quasi certamente» non basta. `apps-script/diagnostica-foglio.gs` risponde, per il foglio su
cui gira: quali trigger sono **davvero** installati; quali funzioni ci sono (cioè quale
variante è); dove cadono Stato e Id e se si risolvono per nome; quante righe hanno uno Stato
aperto adesso e **quante senza Id** — quelle che la rete di sicurezza non ripesca.

Sola lettura, verificato: nessun `setValue`, nessun `appendRow`, nessun `UrlFetchApp`. Si può
lanciare in piena giornata.

Estensioni → Apps Script → incolla in fondo → scegli `diagnosticaFoglio` → ▶ Esegui →
Registro esecuzioni. Un foglio alla volta, dieci secondi l'uno.

## ✅ PRONTA DA INCOLLARE — la rete di sicurezza che non ripescava niente (18/08)

**Il guasto di Agostino, parole sue:** «righe che seppure c'è il Pronto non arrivano».

La rete per quelle **esiste già**: `sweepCheck` gira ogni minuto su ogni foglio e chiama
`recoverMissedStateEvents` dentro `TransferLib`. Ma fa la domanda sbagliata:

```js
if (!id) continue;                              // buco 1
if (queueOpenIds.has(id)) continue;
if (f1IdToStato.get(id) === stato) continue;    // buco 2
```

- **Buco 2 — è il suo caso.** Confronta lo Stato del foglio struttura con quello scritto in
  `Strutture/Foglio1`. Se combaciano decide «già in sync» e salta. Ma combaciare non vuol dire
  essere arrivato: una riga `Pronto` di qua e `Pronto` di là, con la scheda mai partita, viene
  saltata **per sempre**, ogni minuto, in silenzio.
- **Buco 1.** Riga con lo Stato messo e la cella Id vuota: mai ripescata, perché gli Id li
  genera solo `onEdit`. Se `onEdit` è saltato — lock occupato, trigger triplo, errore ingoiato
  dal `catch` — quella riga è invisibile a tutti e due i meccanismi.
- **Buco 3.** Quando salta non lo dice a nessuno.

### La domanda giusta

Non «lo Stato combacia con Foglio1?», ma **«questa riga l'ha presa n8n?»**. La risposta è già
nella cella, perché lo Stato *è* la ricevuta:

| Stato | vuol dire | cosa si fa |
|---|---|---|
| `Pronto` / `Modificato` / `Cancellato` | nessuno l'ha presa | si rimanda |
| `Pronto: Pending` | n8n ce l'ha in mano | si lascia stare |
| `Confermato` | chiusa | si lascia stare |
| vuoto | non è una richiesta | si lascia stare |

Tutti i casi da lasciar stare cadono fuori da soli: nessuno di quei valori sta in
`VALID_STATES`. Foglio1 non si legge più — e il giro diventa anche più leggero, che con
`sweepCheck` andato in timeout **11 volte il 16/08** non guasta.

Due frenate, perché «rimanda sempre» sarebbe una valanga: si aspettano **5 minuti** fra un
tentativo e l'altro, e dopo **5 tentativi a vuoto si grida** invece di ritentare all'infinito.
La memoria dei tentativi è la coda stessa — nessuno stato nuovo da mantenere.

Il grido finisce in coda come `ERROR` col motivo, e su Telegram **se** in Proprietà script ci
sono `TE_TELEGRAM_TOKEN` e `TE_TELEGRAM_CHAT`. Il token non sta nel codice: così il file si
committa senza pulire niente.

`apps-script/transferlib-recupero.gs` · banco verde su 23 prove:
`node banchi/te/banco-recupero.js`. Il banco fa girare **le due versioni sugli stessi casi** e
mostra i due verdetti a confronto.

⚠️ Va insieme a una riga in `processFile`: passare `colId: col.id` nella chiamata, perché ora
il recupero deve poter scrivere l'Id sul foglio. Dettaglio in fondo al file.

🔴 **`TransferLib` gira a Head: appena salvi è viva su tutti e diciotto i fogli.** È il pezzo
più delicato dei tre — si incolla per ultimo, e da solo, non insieme agli altri.

## 🔴 APERTO — due varianti divergenti dello stesso script struttura (18/08)

Suite 10 e Pietra Blu **non hanno lo stesso codice**. Sono due rami dello stesso pezzo, e
ognuno ha qualcosa che manca all'altro. La funzione si chiama pure diversamente:
`enqueueTransfer` su Suite 10, `onEdit` su Pietra Blu.

| | Suite 10 | Pietra Blu |
|---|---|---|
| shim `TransferLib` (`onChangeHandler`, `sweepCheck`) | ✅ | da verificare |
| **GUARD PRONTO** (fornitore / modalità / tariffa 0) | ✅ | ❌ |
| dedup sulle righe PENDING già in coda | ❌ | ✅ (v4) |
| correzione Ora e Telefono | ❌ | ✅ |
| logica «Incassare» (e la sua trappola) | ❌ | ✅ |
| colonne per numero fisso 22 / 24 / 9 | ✅ | ✅ |
| chiamata webhook per il prezzo | ❌ | ❌ |
| data testuale accettata | ❌ | ❌ |

Le ultime due righe stanno **solo** nel `GESTIONALE BARCHE V4.4`
(`_inviaTransferWebhook_`, `_parseDataFlessibile_`): sui fogli struttura non ci sono mai
arrivate.

### La GUARD PRONTO è quella che Agostino voleva ovunque

```js
if (!fornitoreG)              problemi.push("Fornitore");
if (!modalitaG)               problemi.push("Modalita/Pagamento");
if (tariffaZero && !isFree)   problemi.push("Tariffa a 0");
```

Con un'eccezione ben pensata: `isFree` riconosce i transfer di cortesia
(`compliment`, `free shuttle`, `navetta gratu`, `omaggio`…) e li lascia passare con tariffa 0.

### Ma svuota lo Stato anche lei

```js
sheet.getRange(currentRow, TRIGGER_COL).setValue("");
```

Qui almeno la riga **non entra in coda** — il `continue` arriva prima dell'`appendRow` — quindi
non lascia una riga orfana come fa `incassare_` su Pietra Blu. Però l'avviso è un `alert`
dentro un `try/catch` vuoto: in un trigger senza interfaccia non compare, e allora «Pronto»
sparisce e basta.

⚠️ **Questo indebolisce una diagnosi di stamattina.** Avevo attribuito lo `Stato ora è ""`
della riga 69 di 6 Stelle Mama a `incassare_`. Ma anche questa guardia produce uno Stato
vuoto, e **non so quale variante giri su 6 Stelle Mama**. Il banco dimostra che `incassare_`
*può* produrre quel guasto, non che l'abbia prodotto quella volta. Due candidati, uno solo
colpevole: si chiude leggendo lo script di 6 Stelle Mama.

Il tasso di righe di coda doppie **non** distingue le due varianti — Pietra Blu, che il dedup
ce l'ha, sta al 18% e Covo dei Saraceni al 62%. Il grosso dei doppioni lo fa
`recoverMissedStateEvents` in `TransferLib`, che accoda per conto suo. Quindi niente
scorciatoie: per sapere cosa gira su un foglio bisogna leggerlo.

### ✅ PRONTA DA INCOLLARE — la GUARD PRONTO portata sugli altri fogli

`apps-script/struttura-guard-pronto.gs`. Regole identiche a Suite 10, eccezione `isFree`
compresa: non ho inventato nessun controllo nuovo. Due cose sistemate:

- **l'avviso non si perde più.** L'originale affida tutto a `getUi().alert()` dentro un
  `try/catch` vuoto: in un trigger senza interfaccia lancia, il catch se lo mangia, e «Pronto»
  sparisce senza motivo. Qui la motivazione va prima come **nota sulla cella** (non serve
  nessuna finestra) più sfondo rosso; toast e alert restano come canali in più, non unici;
- **l'avviso se ne va da solo** quando la riga torna a posto.

Le colonne restano numeri (`gv[8]`, `gv[15]`, `gv[17]`) come nell'originale: il passaggio ai
nomi si fa nel trasloco in `TransferLib`, su tutto il file insieme.

Banco verde su 22 prove: `node banchi/te/banco-guard-pronto.js`. Il caso che deve **passare**
è vero — la riga 255 di Pietra Blu di stamattina, presa dal `rowValues` dell'esecuzione
`754716`. Se un giorno il banco la blocca, la guardia è diventata troppo severa.

🔴 Da incollare solo dopo un sì: tocca il salvataggio.

**Una decisione che spetta ad Agostino, non l'ho presa io.** Fra le parole di cortesia c'è
`free` da solo, quindi la regola riconosce anche «Freedom», «Freeway», «Free Wi-Fi»: una riga
con tariffa 0 e «Freedom Hotel» nelle note **passa**, e non dovrebbe. È così anche su Suite 10
oggi. È una regola sui soldi: si cambia se lo dice lui. Basta togliere `free`, il resto resta
coperto da `free shuttle` e `gratuit`.

### Dove si va a parare

Non «sistemare diciotto script», ma **una sola versione in `TransferLib`** — che tutti e
diciotto già importano — e sui fogli il guscio che la chiama. Dentro la libreria vanno:
la GUARD PRONTO di Suite 10, il dedup di Pietra Blu, la correzione Ora/Telefono, la logica
incasso corretta, `_parseDataFlessibile_` del gestionale barche, e **un solo** risolutore di
colonne (oggi sono tre: `buildColMap`, `teBuildColMap_`, `cercaCol_`).

Copie di lavoro: `apps-script/struttura-suite10.gs`, `apps-script/struttura-onedit.gs`.
Istantanee datate in `backups/apps-script/`.

## 🟢 SCOPERTO — gli Apps Script si leggono da qui, senza incollare (18/08)

Avevo detto ad Agostino che i progetti Apps Script non erano raggiungibili dalla sessione.
**Era falso, non avevo provato la strada giusta.** L'export di Drive restituisce il sorgente
completo di un progetto:

```
mcp__Google_Drive__download_file_content
  fileId          = <id del progetto Apps Script>
  exportMimeType  = application/vnd.google-apps.script+json
```

Torna base64 di `{files:[{name, type, source}]}`. Se il risultato è grosso l'MCP lo salva su
file e si decodifica con python; se è piccolo arriva inline. Così ho letto per intero
`TransferLib`, il `TRANSFER QUEUE PROCESSOR v3` e il `GESTIONALE BARCHE V4.4` senza che
Agostino incollasse una riga.

**Limite trovato.** La ricerca Drive per `mimeType = 'application/vnd.google-apps.script'`
restituisce solo cinque progetti: `TransferLib`, il queue processor (legato a Strutture),
`GESTIONALE BARCHE V4.4`, `TE Planner`, `Invio Notifiche Telegram`. **Gli script legati ai
singoli fogli struttura non compaiono** — quello di Pietra Blu (`Logica incasso.gs` +
`Webhook.gs`) non è in elenco, e neanche `parentId = <id del foglio>` lo tira fuori.

Quindi per leggerli serve il loro id di progetto, che sta nell'indirizzo dell'editor:
*foglio → Estensioni → Apps Script → copiare l'URL*. Un URL a struttura, niente codice da
incollare. Da lì in poi li leggo, li confronto e li verso nel repo da solo.

## 🔴 APERTO — tre risolutori di colonne per la stessa idea

Il `GESTIONALE BARCHE V4.4` (istantanea in `backups/apps-script/gestionale-barche-v44_20260818.gs`)
ha già risolto due cose che sui fogli struttura non lo sono:

- `_parseDataFlessibile_` — accetta `dd/mm/yyyy`, `yyyy-mm-dd` e la data testuale, invece di
  fidarsi del formato della cella;
- `_inviaTransferWebhook_` — manda il transfer a n8n risolvendo le colonne per nome, con l'ora
  di pickup calcolata (inizio − 20 minuti).

Ma per risolvere le colonne usa `cercaCol_`, che è la **terza** implementazione della stessa
idea: `TransferLib.buildColMap()`, `teBuildColMap_()` nel queue processor, e questa. Tre
tabelle di alias diverse, tre ripieghi diversi. Una correzione va incollata tre volte, e alla
terza ce ne si dimentica una.

Lavoro di convergenza, in tre passi: censire (servono gli URL dei progetti), confrontare
funzione per funzione con un banco, e tenere **una sola** versione in `TransferLib` lasciando
sui fogli il guscio che la chiama.

## 🔴 APERTO — lo Stato cancellato sotto il naso (18/08)

**Il guasto.** Su un foglio struttura, se una riga ha **Modalità = «Incassare»** (col. R) e la
**Tipologia incasso** (col. S) non è ancora scelta, allora `incassare_` — dentro
`onEdit_completo` — cancella **qualunque cosa scrivi su quella riga**:

```js
const tipologiaNonScelta = (modalita === "incassare") && (!tipoVal || tipoVal === PLACEHOLDER);
if (tipologiaNonScelta && !editToccaS) {
  e.range.clearContent();          // <-- anche la colonna V, anche il nome del cliente
  ...toast 4 secondi, "Bloccato"
}
```

Compreso `Pronto` nella colonna V. E `onEdit` intanto ha già messo la riga in coda: un minuto
dopo lo sweeper rilegge lo Stato, lo trova vuoto e scarta.

**Prova sul campo — 6 Stelle Mama riga 69, 17/08 17:48.** In coda:
`ERROR 17.48.35 Id … non trovato`, poi `IGNORATO 17.48.43 — Stato ora è "": n8n la scarta`.
Rigiocato offline in `banchi/te/banco-stato-cancellato.js`: stesso esito, dal codice vero.

La guardia serve — senza tipologia la tariffa esce sbagliata — ma è scritta per proteggere **i
soldi** e finisce per mangiare **il salvataggio**, perché non distingue la colonna V dalle altre.
E l'unico avviso è un toast di quattro secondi in un angolo del foglio: se non stai guardando in
quel momento, il transfer è sparito e nessuno te lo dice.

**La correzione — scritta e provata, da incollare.** `apps-script/struttura-incassare-corretto.gs`
sostituisce `incassare_` in `Logica incasso.gs`, su ogni foglio struttura. Se la modifica tocca lo
Stato (V) o l'Id (X) non si cancella niente: la cella della tipologia si colora e prende una
**nota** che resta finché non la sistemi, il toast passa da 4 a 10 secondi, e **il transfer parte
lo stesso** — la tariffa la controlli sulla scheda Telegram prima di premere ✅. Sulle altre
colonne il blocco resta com'era; per toglierlo ovunque basta allargare `TE_COL_PROTETTE`.

Banco verde su tutte e due i blocchi: `node banchi/te/banco-stato-cancellato.js`.
🔴 Verde sul banco non vuol dire pubblicata: Agostino la incolla quando decide lui.

### Quello che questo guasto NON spiega

`Stato ora è "Confermato"` è tutt'altra cosa, ed è **quasi sempre corretta**: è la scia di una
riga di coda residua, scartata *dopo* che il transfer era già stato consegnato e confermato.

**Pietra Blu riga 255, 18/08.** Sembrava persa, non lo era. 07:55:30 la coda manda; la scheda
arriva su Telegram (Costa Maria, 08:25, Pietra Blu → Polignano, «alla stazione di polignano»);
07:56:02 Agostino conferma e assegna Giovanni Vito Antonio (esec. `754716`, `decision: YES`);
07:56:05 `Smart Write Struttura` scrive `Stato = Confermato` sulla riga 255, trovata **per Id**
(`mode: "update"`, non il ripiego sulla riga vuota); 07:56:34 la coda rilegge, trova
`Confermato` e marca IGNORATO. Il transfer è sul gestionale con l'autista. Nessun recupero a mano.

⚠️ **Da qui una regola:** la coda da sola non sa cosa è arrivato su Telegram. Contare le perdite
guardando solo IGNORATO/ERROR **sovrastima**. Ogni riga sospetta va incrociata con le esecuzioni
n8n prima di chiamarla persa.

### Difetti trovati strada facendo, non ancora affrontati

1. **Tre esecuzioni per ogni modifica** — `onEdit_completo` e `onEdit` installabili, più `onEdit`
   come trigger semplice. Si contendono lo stesso `LockService.getScriptLock()`. Il trigger
   semplice per giunta non ha i permessi per aprire il foglio Strutture: fallisce sempre.
   Il 17/08 alle 18:10-18:11: **24 esecuzioni in 37 secondi**, una durata **88 s**.
2. **Il `catch` di `onEdit` ingoia tutto** e l'esecuzione risulta «Completata» lo stesso.
   *«Completata» non vuol dire che la riga è in coda.* Ogni fallimento deve diventare ERROR
   + messaggio Telegram.
3. **Il dedup guarda solo le PENDING**: se la stessa riga era già in coda come SENT o ERROR ne
   appende un'altra. Sono le righe doppie con lo stesso RowNumber.
4. **Colonne per numero in `onEdit`** (22/24/9) mentre `processQueue` risolve per nome.
   `TransferLib.buildColMap()` esiste già: `onEdit` deve chiamare quella, non riscriverne una.
   Il ripiego per posizione **sta già girando**: Covo dei Saraceni riga 115, 17/08 10:05,
   `data → colonna 3 (per posizione)`.
5. **`Smart Write Struttura`, ripiego sulla riga vuota.** Se non trova l'Id scrive sulla prima
   riga vuota che incontra, e riscrive **l'intera riga** (A→Z). Su un foglio dove si stanno
   compilando prenotazioni nuove è una mina.
6. **`Code - Parse Callback` crasha sui bottoni del controllo incrociato**: esec. `752902`,
   17/08 21:38, `"TENO|8" [line 51]`, poi `Write Target Row` → 404. Quel ✅ non ha fatto niente.

**Backup del codice attuale prima di toccarlo:** `backups/apps-script/struttura-onedit_20260818.gs`.


## Cosa è stato chiuso oggi (17/08)

| | Cosa | Dove | Prova |
|---|---|---|---|
| ✅ | Doppioni dalle strutture (4 guasti) | Apps Script `Strutture` + `TransferLib` | invii `744830`, `747324`: nessun rinvio |
| ✅ | Guardia sulla scrittura del gestionale | `Transfer webhook` | esec. `749101`: esito `ok`, nessuna riscrittura |
| ✅ | Modifiche dalle strutture non rilevate | `Transfer webhook` `59641bd5` | banco su dati veri di `742784` |
| ✅ | Le tre regole del rientro, dal testo al codice | `Tool - Rientro` `cef25980` + `Prenotazioni` `f76ac9b7` | banco su `741981` e `742264` |
| ✅ | Buffer messaggi su Orca | `Orca` `4422b7b6` | banco sui 7 messaggi delle 19:10 |
| ✅ | Controllo incrociato Strutture ↔ Gestionale, ogni ora 08-21 | `OIW5kMQKtYvprbdv` `73c9dffd` | esec. `751571`: rapporto consegnato, `message_id` 5390 |

**Il guasto che l'ha fatto nascere.** MULLINS KRISTINA, Id `TR-20260817-c5e86a34-…`: sul foglio
Auraterrae (riga 4413) **17/08 ore 17:30**, sul gestionale **18/08 ore 01:00**. n8n l'aveva
scritta giusta — esecuzione `747608`, il nodo `gestionale` ha mandato `Data: 17/08/2026`,
`Time: 17:30` — quindi **qualcosa l'ha spostata dopo la scrittura**. Chi, non è ancora accertato.
Il transfer sembrava sparito e invece era parcheggiato all'una di notte del giorno dopo.

⚠️ **Trappola: n8n scrive gli orari in UTC**, due ore indietro rispetto all'ora italiana d'estate.
Una scheda Telegram delle 09:54 è l'esecuzione delle 07:54. Ci ho perso tempo: da ricordare.

Restano aperti: **5** (finestra del buffer più lunga per gli inoltrati), **6** (guardia sui
trigger Telegram muti), **7** (analisi), **3** (riparazione dati sul gestionale, zona rossa),
più i due rinomini di colonna su La Peschiera e Covo dei Saraceni.

**Da chiarire, non risolto:** fra le 08:02 e le 11:12 di oggi Prenotazioni non ha avuto
**nessuna** esecuzione, e Orca nessuna dalle 06:41. Sospetto: `TMP prova Prenotazioni`
(`k9sSAiWfJLGRbkma`), attivo dal 12/08 con 2 trigger, che se porta la stessa credenziale
`Agente transfer` ruba il webhook (Telegram ne accetta uno solo per token). Non verificabile:
ha `availableInMCP: false`. Da questa sessione `api.telegram.org` è bloccato dal proxy, quindi
`getWebhookInfo` non si può interrogare.

## ✅ PUBBLICATA E VISTA GIRARE — guardia sulla scrittura del gestionale (17/08)

`Transfer webhook` `MJHTq5MksSeUhKgX`. Sette nodi **aggiunti**, zero collegamenti esistenti
toccati, zero nodi preesistenti modificati (verificato col backup: le cinque differenze erano
solo i token che avevo redatto io). **Entrambi i trigger intatti**, stesso `webhookId` e stesso
path di prima — il guasto del 16/08 non si è ripetuto.

Il giro: `gestionale` → attendi 3 s → rileggi per Id → se c'è si ferma; se manca riscrive e
riverifica, fino a 4 tentativi; se ne trova più d'una non tocca niente e avvisa su Telegram.
Codice e banco: `n8n/transfer-webhook/verifica-gestionale.js`, `banchi/te/banco-verifica.js`.

**Prova sul campo — esecuzione `749101`, 17/08 10:18.** Catena completa nel runData:
`gestionale` (1032 ms) → `Attendi verifica gestionale` (3004 ms) → `Rileggi gestionale per Id`
(riga 946 trovata, 732 ms) → `Esito verifica gestionale` →
`{esito: "ok", trovate: 1, motivo: "riga presente sul gestionale"}` → `Riga da riscrivere?` ramo
falso → `Serve gridare?` ramo falso → fine. **Nessuna riscrittura, nessun allarme.** Costo: circa
3,7 s in più per conferma.

⚠️ **Trappola nuova, da ricordare.** Prima di questa prova avevo guardato le esecuzioni `748054`
(08:59) e `748840` (10:03) e i nodi della guardia non c'erano: sembrava non partisse. Erano
esecuzioni **precedenti alla versione attiva** — la guardia è nata alle 09:57 e la versione
pubblicata buona (`baac388d`) è delle 10:09:55. Regola: dopo una pubblicazione si guardano solo
le esecuzioni con `startedAt` successivo al `createdAt` della versione attiva
(`get_workflow_history`), altrimenti si diagnostica un guasto che non esiste.

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

**✅ Coda ripulita.** `sistemaCodaVecchia` lanciata il 17/08 alle 10:10: le righe rotte dall'8
giugno sono `IGNORATO` con la loro spiegazione, non più `ERROR`. Verificato leggendo la Queue.

**Resta solo, e senza fretta:**
- rinominare `Colonna 2` → `Note` su **La Peschiera** e `Colonna 1` → `Data` su
  **Covo dei Saraceni** (vedi punto 1-bis). Il codice funziona lo stesso, ripiega sulla
  posizione giusta e lo scrive nel log;
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

## 4. Buffer messaggi su Orca — ✅ PUBBLICATO (17/08, 13:15)
**Versione attiva `4422b7b6`**, `versionId == activeVersionId`, 120 nodi, trigger Telegram con
`webhookId` **invariato** (`b8e5f2a1-…-orca0001abcd`). Sette nodi **aggiunti**, nessun nodo
preesistente modificato, nessun altro collegamento toccato (confronto prima/dopo).

**Il guasto.** Orca non aveva nessun buffer: zero nodi `wait`, zero `dataTable` fra il trigger e
l'agente. N messaggi = N esecuzioni = N risposte, ognuna cieca sulle altre.
Prove: 16/08 14:38:33 quattro esecuzioni in 0,6 s (`742008`-`742011`); 16/08 17:10:21-22 **cinque
esecuzioni nello stesso secondo** (`743895`-`743899`); 16/08 19:10 **sette messaggi di fila** di
Agostino e sette risposte separate, ognuna che chiedeva il contesto delle altre («A cosa ti
riferisci con "sisi"?», «non ho contesto su questo "aperitivo"», «"1h e 30" durata di cosa?»).

**La correzione.** Copiato senza cambiarne la logica il buffer già in produzione su Prenotazioni
dal 15/08: `Da bufferizzare?` → `Metti in coda` → `Aspetta 8 s` → `Rileggi coda` →
`Sono l'ultimo?` → (agente + `Righe da ripulire` → `Svuota coda`). I click sui bottoni non
passano dal buffer e restano immediati.
**Coda propria:** tabella dati `Buffer Orca` (`XzcR2xkW96NvCA7B`). Deve restare separata da
`Buffer Prenotazioni` (`Pi1gSvGHG5mttYWE`): la chat di Agostino ha lo **stesso id** sui due bot,
una coda condivisa mescolerebbe i messaggi.

Codice: `n8n/orca/buffer-sono-lultimo.js`, `n8n/orca/buffer-righe-da-ripulire.js`.
Banco: `banchi/te/banco-buffer-orca.js` — 32 prove, i sette messaggi veri delle 19:10 diventano
**una risposta sola** con il discorso unito in ordine.

**Da guardare al primo giro vero:** mandare due o tre messaggi di fila. Deve arrivare **una**
risposta. Se ne arrivano due, guardare `_buffer_uniti` nell'uscita di `Buffer - Sono l'ultimo?`.

## 5. Finestra del buffer più lunga per i messaggi inoltrati (tutti e due i bot)
**Ora ha senso su tutti e due:** dal 17/08 il buffer c'è anche su Orca, con la stessa finestra
di 8 secondi. Il caso dei sette messaggi delle 19:10 lo prende (erano ravvicinati); resta da
prendere quello degli inoltri a mano, che distano 20-30 s.
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

## 8. Modifiche dalle strutture non rilevate — ✅ PUBBLICATA (17/08, 10:22)
**Versione attiva `59641bd5`**, `versionId == activeVersionId`. Riletto il nodo dal server e
diffato con il file provato sul banco: identici (solo un a-capo finale in più). Confrontato
l'intero workflow prima/dopo: **nessun altro nodo e nessun collegamento toccati**, 79 nodi,
2 trigger. Le tre segnalazioni di validazione sono tutte `preExisting`.

**Da guardare alla prima modifica che arriva da una struttura:** se la struttura lascia Stato
`Pronto` ma cambia un campo, la scheda deve uscire «🟡 MODIFICA TRANSFER» con l'elenco dei
cambi. Se esce «🟢 NUOVO TRANSFER» su un transfer che esiste già sul gestionale, la correzione
non ha preso.

**Causa trovata (17/08).** In `Code in JavaScript2` la prima riga di controllo era:
```js
if (tipologia !== 'MODIFICA' || !oldData) { /* niente confronto */ }
```
e `tipologia` nasce dalla **colonna Stato scritta dalla struttura** (`Pronto` → NUOVO,
`Modificato` → MODIFICA). Quindi bastava che una struttura modificasse una riga lasciando
`Pronto` e il confronto veniva saltato del tutto: usciva «🟢 NUOVO TRANSFER» senza un accenno
a cosa fosse cambiato. È di nuovo la regola di `CLAUDE.md`: una cosa che conta decisa da quello
che qualcuno ha scritto invece che dal dato.

**Correzione:** comanda il dato. Se la riga esiste sul gestionale si confronta sempre; le
cancellazioni restano fuori. Codice in `n8n/transfer-webhook/code-in-javascript2.js`, banco in
`banchi/te/banco-modifiche.js` (26 prove, dati veri di `742784`).

**Trappola trovata dal banco:** il nodo Sheets può restituire un item **vuoto** `{}` quando non
trova la riga, e `{}` è truthy. Togliendo il test su `tipologia` senza accorgersene, un transfer
davvero nuovo sarebbe risultato «modificato in tutto». Ora una riga vale come vecchia solo se
porta davvero un Id.

**Pubblicata** su via di Agostino. Zona gialla: cambia la scheda su Telegram, verso Agostino,
non verso clienti. Trigger verificati dopo la pubblicazione (2, intatti) — il 16/08 ripubblicare
aveva staccato un webhook.

### Prova originale
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
