# Apps Script — correzioni pronte da incollare

**Da questa sessione non posso scrivere sugli Apps Script.** Google Drive qui dà lettura,
copia e creazione di file nuovi; non c'è modo di aggiornare il sorgente di un progetto
esistente, e il ponte è chiuso per rete. Quindi il codice è pronto e provato, ma va incollato
a mano da Agostino.

Prove offline (nessun foglio vivo toccato):

```
node banchi/te/banco-queue.js        # 56 prove — transfer-queue-processor.gs
node banchi/te/banco-transferlib.js  # 60 prove — TransferLib.gs
```

## Come vengono riconosciute le colonne

Le intestazioni sono tolleranti, ma **non tirano a indovinare**. Tre passaggi:

1. **Per nome**, con confronto esatto dopo aver ridotto l'intestazione alla forma
   nuda — via maiuscole, accenti, spazi e punteggiatura. Quindi `Tariffa ` = `Tariffa`,
   `cell.` = `Cell`, `Modalità` = `Modalita`, `TRS> DA` = `TRS DA`, `n. pratica` = `N. Pratica`.
   Ogni campo ha una lista di nomi accettati (`Time`/`Ora`/`Orario`, `cell.`/`Telefono`,
   `Stato`/`Status`, `n. pratica`/`mail`…). Si risolvono prima i campi più importanti, e
   **una colonna già presa non si può rubare**.
2. **Per posizione**, il numero della versione vecchia, ma solo se quella colonna è
   ancora libera. Va nel log, così si vede.
3. **Non risolta** → il campo resta vuoto e viene segnalato.

**Non esiste nessun passaggio «somiglia a».** Cercando per pezzi, `Tariffa` beccherebbe
anche `Tariffa a noi`: manderemmo il costo nostro al posto del prezzo al cliente, e su una
riga vera vuol dire fatturare storto. Il banco ha tre prove apposta su questo.

`Stato` e `Id` sono trattati a parte: se non si individuano, **non si manda niente** e la
riga di coda va in ERROR con scritto il perché. Sono le due colonne che, sbagliate, fanno
partire il transfer di un altro cliente.

Per vedere come si risolve ogni struttura, senza scrivere niente:
**`diagnosticaIntestazioni()`** nel Queue Processor.

---

## 1. `transfer-queue-processor.gs`

**Dove:** progetto Apps Script `1JPUJQRac9_W78r5L3nDILLcvxVfU05dMAEn1qh0CHci_SbNjMoczzrUs`
(«Progetto senza titolo», *Transfer Queue Processor v2*), legato al file centrale
`Strutture` — tab `Foglio1` e `Queue`.

**Come:** apri il progetto, seleziona tutto il file `Codice`, incolla al suo posto il
contenuto di `apps-script/transfer-queue-processor.gs`, salva.
Il trigger esistente **non va toccato**: `processQueueTimer1` si chiama uguale.

### Cosa cambia

| | v2 (oggi) | v3 |
|---|---|---|
| Attesa dell'ack | `MAX_VERIFY_MS = 6000` | `30000` |
| Colonne | numeri fissi (`getRange(riga, 22)`, `sourceRow[23]`) | per nome, con rete sui numeri vecchi |
| Riga da mandare | il `RowNumber` salvato in Queue, preso per buono | confermata cercando l'**Id** |

**La finestra a 6 secondi era la causa dei doppioni.** n8n riscrive `": Pending"` sulla riga
struttura intorno al secondo 13 (esecuzione `742784`: `Pending Transfer1` parte a 5,19 s e dura
8,18 s). La finestra si chiudeva sempre prima, la riga andava `SENT` e dopo 90 secondi
ripartiva. Prova: Suite 10/Giovì riga 134, 16:47:20 → 16:50:20, stesso Id, due giri da 90 s.
`30000` è il valore che c'era prima del refactor del 2026-06-08 (`processQueue_BACKUP`).

**Il `RowNumber` non comanda più.** La v2 si fidava di un numero di riga salvato in Queue anche
ore prima dalla scansione: se nel frattempo qualcuno inserisce o cancella una riga, quel numero
punta al transfer di un altro cliente — e la v2 manda quello. Ora il numero è solo un
suggerimento: si verifica che l'Id di quella riga sia quello atteso, altrimenti si cerca l'Id
nella colonna Id. **Se l'Id non c'è, la riga va in ERROR e non si manda niente.**

### Una volta sola, a mano

`sbloccaErroriVecchi()` rimette in PENDING le righe finite in ERROR con
`"Cannot convert '' to int."` — sono ferme dal 2026-06-08, quando la colonna E della Queue è
passata da booleano `Processing` a contatore `Attempts`. Oggi riguarda almeno Melograno,
Covo dei Saraceni e Suite 10/Giovì. Lancialo dopo aver incollato il codice.

---

## 2. `TransferLib.gs`

**Dove:** progetto `1vo74eNOp7bRgiU-ioVRTRCfb2k9rmDVlV5lmW_DoFKTTKZM_or7K0o96` — la libreria
importata da **tutti e 18** i file struttura.

**Come:** incolla al posto del file `Codice`, salva, **poi pubblica una nuova versione**.
I file struttura che importano con versione `HEAD` la prendono al giro dopo; quelli
agganciati a una versione fissa vanno ripuntati a mano.

### Cosa cambia

Le colonne non sono più numeri fissi:

```js
// prima
const SCHEMA = { ORA_COL: 4, TELEFONO_COL: 11, FORNITORE_COL: 9, STATO_COL: 22, ID_COL: 24 };
```

Ora si risolvono dalle intestazioni, con gli alias che servono davvero: `Time`/`Ora`,
`cell.`/`Cellulare`, `n. pratica`/`mail`. Se un nome non si trova si torna al numero della v1
e si scrive un avviso nel log — comportamento identico a oggi nel caso peggiore, corretto in
tutti gli altri. Il banco verifica che **sui file di oggi la mappa coincide esattamente con i
numeri della v1**: nessuna regressione.

### Difetto della v1 trovato dal banco, e corretto

`normalizeOra` non rispettava il suo stesso commento. Il controllo «è già giusto» girava sulla
stringa **dopo** aver sostituito la virgola: `"21,15"` diventava `"21:15"`, la guardia diceva
«a posto» e tornava `null`, quindi la cella restava `21,15`. Colpiva ogni orario scritto con
virgola o punto e due cifre d'ora — `10.30`, `18,45`, `21,15`. Ora il confronto si fa sul valore
originale.

Sui fogli veri ci sono orari così: vanno al gestionale come testo non normalizzato.

---

## Verifica delle intestazioni — tutte le strutture, 16/08

Lette eseguendo `sheets_read` del ponte `Claude Bridge - Universal` (`0DVJEFcjGb8eTUmj`) da
dentro n8n, esecuzioni `744115`–`744134`. **Nessuna scrittura.**

| Struttura | Stato | Id | Da notare |
|---|---|---|---|
| Suite 10/Giovì | 22 | 24 | |
| Pietra Blu | 22 | 24 | |
| Antico Mondo | 22 | 24 | |
| Auraterrae | 22 | 24 | |
| Musae Relais & SPA | 22 | 24 | |
| Musae al Mare | 22 | 24 | |
| Bayit | 22 | 24 | |
| Uliveus | 22 | 24 | |
| Puglia Mare_AGOSTINO | 22 | 24 | |
| Serafini | 22 | 24 | riga 2 con dati spazzatura (`Mese: "f44eii"`) |
| Housea | 22 | 24 | |
| Trulli Lamafico | 22 | 24 | |
| Dorino gite in barca | 22 | 24 | ha la tab `Prenotazioni` standard |
| Melograno | 22 | 24 | `Tariffa` **senza** spazio; colonna extra `Booked from` in fondo |
| 6 Stelle Mama | 22 | 24 | `Tariffa` **senza** spazio |
| La Peschiera | 22 | 24 | ⚠️ colonna 2 = **`Colonna 2`**, non `Note` |
| Covo dei Saraceni | 22 | 24 | ⚠️ colonna 3 = **`Colonna 1`**, non `Data` |
| Agostino Tedi tour operator | — | — | **nessuna tab `Prenotazioni`**: non passa da `TransferLib` |

**Su tutte e 17 quelle attive i numeri della v1 reggono: Stato alla 22, Id alla 24.**
Il guasto delle colonne fisse **non è ancora in atto**. È una mina, non un incendio — e con la
v2 smette di essere una mina.

### Tre cose che i dati hanno detto, e che non si potevano indovinare

1. **`Tariffa` e `Tariffa ` convivono.** Quasi tutte hanno lo spazio in coda; Melograno e
   6 Stelle Mama no. Chi confronta l'intestazione senza ripulirla ne perde una parte. Il
   `normHeader` della v2 le tratta uguali.
2. **Due strutture hanno intestazioni generiche di Google:** La Peschiera ha `Colonna 2` dove
   dovrebbe esserci `Note`, Covo dei Saraceni ha `Colonna 1` dove dovrebbe esserci `Data`.
   La v2 non trova il nome, ripiega sulla posizione (che è quella giusta) e lo scrive nel log.
   **Conviene rinominarle a mano** — è l'unica correzione che chiede il foglio e non il codice.
3. **Agostino Tedi tour operator non ha la tab `Prenotazioni`.** Se sta ancora nell'elenco
   delle strutture attive, ogni giro di scansione lo salta: da togliere o da sistemare.
