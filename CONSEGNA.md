# CONSEGNA — 21/08/2026, sera

Sessione lunga su **Prenotazioni Transfer 6.0**. Questo file serve a ripartire senza
rileggere niente. Le regole di casa restano in `CLAUDE.md`: leggilo prima.

**Obiettivo della prossima sessione:** Prenotazioni e **Orca** — che funzionino meglio,
più veloci, e che le regole qui sotto siano applicate davvero.

## 🔴 La prima cosa da fare

**Il lavoro di ieri sera è scritto, provato e committato, ma NON è in produzione.**

| | |
|---|---|
| in produzione ora | `d4ac49f0` (registro bozze v6 + guardia salvataggio) |
| pronto e non caricato | punto 2 (guardia affermazioni) e punto 3 (stato scheda + modifiche) |
| nodi da caricare | `Code in JavaScript`, `Aggiorna Bozze`, `Componi Payload Salvataggio` |
| workflow | Prenotazioni `NT4lxIxyBAl5lHpN` |

Procedura, senza saltare passi: caricare in bozza → **rileggere i nodi dal server e fare il
diff coi file locali** → se non sono identici NON si pubblica → rifare girare i banchi sulla
copia scaricata → `publish_workflow` → controllare che `activeVersionId` sia cambiato.

## Che cosa è successo, e che cosa è cambiato

Agostino ieri: *«non c'è un briciolo né di memoria né d'intelligenza»*. Aveva ragione, e la
causa era una sola, in tre forme:

> **La verità viveva nella testa del modello, non in un registro.** Cosa è bozza, cosa è
> salvato, cosa c'è sul gestionale: ogni turno se lo ri-inventava.

**In produzione (`d4ac49f0`)**
- `Assegna Id` in Parse transfer: nessuna riga esce senza Id. Chiude la classe delle righe
  orfane e rende ogni ri-salvataggio un *update*.
- Registro bozze **v6** — «spedito» non è «salvato». Esce dal registro solo chi compare
  nella ricevuta; lo scarto resta, marcato. Nasce dall'esec. **781233**: 3 spedite, ricevuta
  di 1, e la v5 le cancellò tutte e tre — due transfer spariti.
- `Guardia Salvataggio` — se la ricevuta porta meno righe di quante ne sono partite, lo dice:
  quante mandate, quante tornate, quali mancano con tratta e Id, e che **non si sa** se sono
  state scritte.
- «Salva e mostra»: una scheda nuova e completa si salva da sola, con bottone «🗑️ Annulla».
  Freni: tariffa DA DEFINIRE o zero, acconto/deposito/SumUp/preventivi, ⛔ nel testo, e se il
  bot dice che *toglie* qualcosa.

**Pronto, non caricato**
- **Punto 2** — il bot non parla del gestionale senza averlo aperto. Ogni affermazione è
  legata al tool che la proverebbe (`get_destination`, `get_fornitore`, `get_autista`,
  `cerca_servizi`). Senza prova cambia la premessa falsa e la domanda resta. Esec. 781061 e
  781122: zero tool chiamati, due frasi inventate.
- **Punto 3** — stato della scheda `bozza · spedita · salvata`, scritto solo dal codice.
  Le `salvata` restano in registro; il payload scarta le ristampe identiche; se una `salvata`
  torna **cambiata** il codice alza `intent = 'modifica'` e la correzione arriva sul foglio.
  «Tolgo il secondo» non cancella da solo: mette il bottone con l'Id vero.

## ⚠️ Da sistemare sul gestionale (a mano o via API)

Queste sono righe **vere e sbagliate**, non codice:

- **1281** VICINI 2 pax **120€** e **1282** ALBERTI 4 pax **140€** — 22/08 13:30 Bari Airport
  → Hotel Excelsior. Agostino aveva detto: è **un solo** transfer, 6 pax, **60€**. Le
  correzioni non sono mai arrivate. Va corretta la 1281 e cancellata (morbida) la 1282.
- **1271** — campo `Nome` = `URA`, e Data/Time vuote (trascrizione di un vocale).
- I due transfer **Masseria Tarsia Morisco ↔ Monopoli**, 21/08 sera, 55€ l'uno: spediti,
  mai confermati dalla ricevuta, poi persi. Verificare se esistono.

**La chiave del service account non era in questa sessione** (`TE_SA_KEY` assente,
`/home/claude/gsheets/key.json` assente): i fogli non si potevano né leggere né scrivere via
API. Se serve, chiederla ad Agostino all'inizio.

## Le regole che lui ha chiesto, e che vanno applicate

1. **Non chiedere il permesso.** L'ha ripetuto cinque volte. Si fa e si racconta. Restano
   rossi solo i quattro casi di `CLAUDE.md` (prezzi su righe vere, scrivere sul gestionale,
   messaggi che escono verso clienti/autisti/fornitori, spegnere un workflow).
2. **Risposte brevi, in italiano.**
3. **Mai una prova su chat o fogli vivi.** Banco offline prima, sempre.
4. **Le prove si prendono dalle esecuzioni**, non da quello che il bot dice di aver fatto.
   Numero di esecuzione, nodo, valore. Se non c'è la prova, non è un fatto.
5. **Bottoni al posto di frasi**, Id generati dal codice, `onError` sui nodi che scrivono.
6. **Cancellazione morbida**, mai `delete`: `Allert = Cancellato` + nota ⛔.
7. **In dubbio si tiene.** Una bozza di troppo è rumore, una persa è un transfer che sparisce.
8. **DeepSeek resta** (costa meno). Il lavoro si fa sul prompt e sul codice, non cambiando
   modello.

## Trappole pagate a caro prezzo, in questa sessione

- **Le sequenze `\uXXXX` si rompono passando dall'API.** Una volta sono arrivate come byte
  NUL veri, una volta col backslash raddoppiato. Nel sorgente dei nodi si usa
  `String.fromCharCode(0)`. Non reintrodurre escape unicode nei nodi.
- `versionDescription` **massimo 1000 caratteri** — respinge tutta la chiamata.
- Dopo `update_workflow` serve `publish_workflow`. E dopo, **rileggere e diffare**.
- `\s` **non mangia le emoji**: `^\s*Tariffa\s*:` non trova `💰 Tariffa:`. La forma giusta è
  `^[^\p{L}\n]*[ \t]*(?:Nome)[ \t]*:`.
- Google Sheets `appendOrUpdate` su chiave inesistente **appende**.
- `callback_data` Telegram: massimo 64 **byte**.

## Aperto, da decidere con lui

- **Modalità di pagamento: quattro voci o sette?** Il prompt si contraddice (§4.10/§4.22
  contro riga 31). Finché non risponde, non si normalizza niente: un tentativo è già stato
  pubblicato e ritirato in dieci minuti il 21/08.
- `Bozze - Chiedi cosa salvare` dice ancora «sul gestionale non ci sono» anche per le schede
  `spedita`, di cui non si sa niente. Va riscritto (non ha ancora un file locale).
- **Il buffer** — mentre il sistema elabora, un messaggio nuovo deve essere raccolto prima di
  rispondere, e l'esecuzione precedente spenta. Progettato, mai costruito.
- **Orca** (`UAz4R93BWh9VuLiR`) — non toccato. Gira su un altro bot e fa domande che solo il
  cliente può sapere.
- `PROMPT-IN-CODICE.md` — gruppo B: le altre regole deterministiche da spostare nel codice.
  Prima di spostarne una, **cercare tutti i punti del prompt che ne parlano**.

## Dove sono le cose

Banchi offline in `banchi/te/` — tutti verdi:
`banco-salva-e-mostra` 23 · `banco-bottone-annulla` 14 · `banco-bozze` 30 ·
`banco-guardia-salvataggio` 45 · `banco-affermazioni-gestionale` 25 ·
`banco-stato-scheda` 26 · `banco-assegna-id` 22.

Copie dei nodi in `backups/n8n/prenotazioni/` e `backups/n8n/parse-transfer/`.
Ramo `claude/prenotazioni-andata-ritorno-mjg049`, PR #1. Ultimo commit `f7c8a15`.

⛔ `backups/n8n/parse-transfer/normalizza-modalita.js` — **non pubblicare**: violava una
regola esplicita di Agostino. Il file spiega perché.

---

## Come ripartire, in tre righe

1. Leggi `CLAUDE.md`, poi questo file.
2. Chiudi il punto 🔴 qui sopra: carica e pubblica i tre nodi. È mezz'ora, ed è lavoro già
   provato che sta fermo.
3. Poi Orca. Prima di toccarla, leggi le sue esecuzioni vere: la stessa malattia di
   Prenotazioni — decisioni lasciate alle parole del modello — molto probabilmente c'è anche
   lì, e la cura è la stessa.

## Una cosa da non dimenticare, sul come si lavora

In questa sessione ho sbagliato tre volte allo stesso modo: ho **dichiarato fatto** qualcosa
che non era in produzione, o **affermato** un salvataggio senza guardare la ricevuta. Ogni
volta l'ha scoperto Agostino, non io.

La regola che ne esce, e che vale più di qualunque riga di codice qui dentro:
**prima di dire che una cosa funziona, guarda l'esecuzione vera.** Numero, nodo, valore.
Se il diff col server non torna, non è pubblicato. Se la ricevuta non lo dice, non è salvato.
