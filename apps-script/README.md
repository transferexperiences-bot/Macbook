# Apps Script — correzioni pronte da incollare

**Da questa sessione non posso scrivere sugli Apps Script.** Google Drive qui dà lettura,
copia e creazione di file nuovi; non c'è modo di aggiornare il sorgente di un progetto
esistente, e il ponte è chiuso per rete. Quindi il codice è pronto e provato, ma va incollato
a mano da Agostino.

Prove offline (nessun foglio vivo toccato):

```
node banchi/te/banco-queue.js        # 32 prove — transfer-queue-processor.gs
node banchi/te/banco-transferlib.js  # 37 prove — TransferLib.gs
```

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

## Verifica delle intestazioni — 9 strutture su 18

Lette il 16/08 eseguendo `sheets_read` del ponte `Claude Bridge - Universal`
(`0DVJEFcjGb8eTUmj`) da dentro n8n. Nessuna scrittura.

| Struttura | Stato | Id | Note |
|---|---|---|---|
| Suite 10/Giovì | 22 | 24 | `Tariffa ` con spazio |
| Pietra Blu | 22 | 24 | da esecuzione `729828` |
| Antico Mondo | 22 | 24 | `Tariffa ` con spazio |
| Auraterrae | 22 | 24 | `Tariffa ` con spazio |
| Musae Relais & SPA | 22 | 24 | `Tariffa ` con spazio |
| Bayit | 22 | 24 | `Tariffa ` con spazio |
| Melograno | 22 | 24 | `Tariffa` **senza** spazio; colonna extra `Booked from` in fondo |
| 6 Stelle Mama | 22 | 24 | `Tariffa` **senza** spazio |
| La Peschiera | 22 | 24 | ⚠️ la colonna 2 si chiama **`Colonna 2`**, non `Note` |

**Su tutte e nove i numeri della v1 reggono.** Il guasto delle colonne fisse non è ancora in
atto: è una mina, non un incendio.

Due cose confermate dai dati veri, non ipotizzate:
- **`Tariffa` e `Tariffa ` convivono** fra le strutture. Chi confronta l'intestazione senza
  ripulirla ne perde una parte. Il `normHeader` di questa v2 le tratta uguali.
- **La Peschiera ha `Colonna 2` al posto di `Note`.** La v2 non trova il nome, ripiega sulla
  colonna 2 (che è quella giusta) e lo scrive nel log. Conviene rinominarla a mano in `Note`:
  è l'unica correzione che chiede il foglio e non il codice.

### Le 9 che restano

Puglia Mare_AGOSTINO, Covo dei Saraceni, Musae al Mare, Uliveus, Agostino Tedi tour operator,
Housea, Serafini, Trulli Lamafico, Dorino gite in barca.

Le letture sono **già state eseguite** — esecuzioni `744123`, `744124`, `744126`, `744127`,
`744128`, `744129`, `744130`, `744131`, `744132`, `744134` del workflow `0DVJEFcjGb8eTUmj` —
ma il classificatore dei permessi della sessione ha iniziato a bloccare la lettura dei
risultati. I dati ci sono e si aprono dall'interfaccia n8n, oppure si rileggono in una
sessione con quel permesso concesso.

Nota: `Dorino gite in barca` ha uno schema suo (gestionale barche) e probabilmente non ha
nemmeno la tab `Prenotazioni`: non passa da `TransferLib`.
