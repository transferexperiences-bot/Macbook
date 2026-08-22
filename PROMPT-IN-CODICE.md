# Il prompt di Prenotazioni: che cosa deve diventare codice

Inventario delle regole del nodo `📋 System Prompt v6.36` (Prenotazioni Transfer 6.0),
letto riga per riga il 21/08/2026.

**Il prompt oggi:** 62.655 caratteri, 558 righe, ~15.700 token.
**146 righe** contengono una regola assoluta (`⛔` / `MAI` / `SEMPRE`).

Una regola assoluta è per definizione deterministica. Chiederla a un modello vuol dire
sperare che se la ricordi tutte insieme, ogni turno. Scriverla in codice vuol dire che
succede e basta.

| | caratteri | quota del prompt |
|---|---|---|
| A — già garantite dal codice, riga morta nel prompt | 5.284 | 8% |
| B — deterministiche, da portare nel codice | 13.797 | 22% |
| **totale recuperabile** | **19.081** | **30%** |
| prompt dopo | 43.574 (~10.900 token) | |

---

> ## ⚠️ CORREZIONE 21/08/2026, ore 09:40
>
> **La tabella del gruppo A qui sotto è sbagliata.** L'ho scritta da una lettura veloce,
> senza verificare che cosa il codice garantisca davvero. Verificandolo:
>
> - **Markdown** — provato sul codice vero: converte solo `**` `*` `__` `~~`.
>   `#`, `>` e `---` **passano intatti**. La regola serve. Non si cancella.
> - **Giorno della settimana** — `WEEKDAY_RX` corregge solo la forma `21/08/2026 (giovedì)`
>   dentro il recap. «il 21 agosto è giovedì» scritto in una frase non lo tocca nessuno.
>   Non si cancella.
> - **Generazione Id** — `Assegna Id` garantisce che la RIGA abbia un Id, non che il recap
>   mostri **lo stesso** Id. Cancellarla scollegherebbe il registro bozze. Non si cancella.
> - **Policy, link, storage** — il codice le aggiunge ma non toglie quelle scritte dal
>   modello: la regola evita i doppioni. Non si cancellano.
>
> **Del gruppo A resta viva una regola sola: §4.42, 312 caratteri.** Non 5.284.
> Il gruppo B resta valido: lì la regola si sposta, non si cancella.
>
> ### E una trappola trovata sul campo, che vale per tutto il gruppo B
>
> Il primo tentativo su B1 (modalità di pagamento) è stato **pubblicato e ritirato dopo
> dieci minuti**. Il prompt si contraddice: §4.10 e §4.22 dichiarano **quattro** valori e
> mappano «Contanti»/«Carta» → «Incassare»; la riga 31 — regola di Agostino del 05/08 —
> ne elenca **sette** e vieta espressamente quella conversione («cambieresti in silenzio
> un dato di Agostino»); la riga 557 dice che sul rientro la conversione è giusta, ma la
> decide `tool_rientro`.
>
> Non sono contraddizioni da sanare a tavolino: sono tre situazioni diverse. Un nodo
> messo un attimo prima della scrittura vede solo un valore e non sa in quale si trova.
>
> **Regola che ne esce, e vale per ogni voce del gruppo B:** prima di spostare una regola
> nel codice bisogna cercare **tutti** i punti del prompt che parlano di quella cosa, non
> solo quello che l'ha suggerita. E dove il prompt si contraddice, si chiede ad Agostino
> qual è la versione buona — non si sceglie.

## A · ~~Già garantite dal codice — si cancellano e basta~~ (vedi correzione sopra)

Qui il codice fa già la cosa giusta *dopo* che il modello ha risposto. La regola nel
prompt non aggiunge niente: è peso morto che compete per l'attenzione con le regole vive.

| regola | righe | car | chi la garantisce già |
|---|---|---|---|
| Giorno della settimana — mai a mente | 25-29, 56, 452, 454 | 1.418 | `Code in JavaScript` ricalcola il giorno da zero (`ITALIAN_DAYS` + `WEEKDAY_RX`) su ogni data del testo |
| Policy cancellazione/ritardo, 5 punti | 289-294 | 798 | `Format Telegram Output (intent)`. Il prompt stesso dice «la aggiunge il codice» — e poi la scrive tutta |
| Link WhatsApp e Maps | 375 | 88 | `Aggiungi link WhatsApp` |
| Divieto markdown | 66-69, 510 | 832 | `Code in JavaScript` converte `**`/`*`/`__`/`~~` in HTML e butta i tag non ammessi |
| Generazione Id obbligatoria | 204-208 | 1.128 | **da oggi** `Assegna Id` in Parse transfer: nessuna riga esce senza Id |
| Storage: non chiamare `get_info`/`svuota_storage` | 352-356 | 708 | il flusso legge e svuota da solo |
| Bozze: cita sempre gli Id quando scarti | 546-547 | 312 | **da oggi** il registro bozze riconosce lo scarto dal gesto, non dagli Id citati |

**5.284 caratteri che si tolgono oggi, senza scrivere una riga di codice nuova.**

---

## B · Deterministiche — diventano un controllo nel codice

Qui la regola va spostata, non cancellata. Il modello continua a scrivere quello che ha
capito; il codice lo normalizza o lo ferma **prima** che arrivi al gestionale.

### B1 · Modalità di pagamento — 2.481 car (righe 31, 81, 182-191)
Quattro valori validi (`Incassare | Fattura | Sconto in fattura | Dalla struttura`) più
una mappa di ~30 sinonimi. Oggi sono 30 righe di prompt.
**In codice:** whitelist + mappa sinonimi in `Componi Payload Salvataggio`. Fuori lista →
non si scrive e si chiede coi 4 bottoni. Il modello non può più inventare «Bonifico».

### B2 · Parsing orari italiani — 1.034 car (193-202)
«due e mezza», «un quarto alle 9», «mezzogiorno», «ore 02.30».
**In codice:** una funzione `oraIT()`. Deterministica e testabile su banco con tutte le
forme dell'elenco. L'unica domanda che resta al modello è AM/PM in vera ambiguità.

### B3 · Ora implicita e anno della data — 987 car (58-64)
«ora futura → oggi, ora passata → domani», «mese già passato → anno+1».
**In codice:** aritmetica pura sul fuso Europe/Rome.

### B4 · Toponimi ambigui — 567 car (129-133)
«stazione» → «Stazione di Polignano a Mare», «aeroporto» → «Bari Airport».
**In codice:** dentro `Risolvi Luogo`, che già esiste. (È lo stesso guasto che il 20/08 mandava
«stazione» su «Stazione di Bari».)

### B5 · Acconto / taglio SumUp — 2.718 car (296-299, 306-316)
20% del totale arrotondato al taglio più vicino fra 20/50/100/200/300/500/1000.
**In codice:** cinque righe. È aritmetica: non deve farla un modello.

### B6 · «Nome (link)» → vale il nome — 1.177 car (226-231)
**In codice:** `stripMaps()` in Parse transfer lo fa già a metà. Va completato e applicato
anche a monte, così il valore sbagliato non entra nemmeno nella scheda.

### B7 · Autista solo se matcha la lista — 1.206 car (335-342)
**In codice:** controllo contro `get_autista` prima della scrittura. Nome non in lista →
campo Autista vuoto, il nome va in Nome. Niente da ricordare.

### B8 · Divieti di formato e campi — 2.679 car (498-514)
Diciassette righe di `⛔ MAI`: id troncati, campi rinominati, campi valorizzati omessi,
annotazioni fra parentesi nei valori, intent misti.
**In codice:** un validatore della scheda prima dell'invio. Se la scheda non è conforme,
il codice la raddrizza — e quello che non sa raddrizzare lo segnala invece di lasciarlo passare.

### B9 · Filtro ora «ancora da svolgere» — 592 car (456-459)
**In codice:** confronto `Ora >= oraCorrente - 10min`.

### B10 · Confronto ore aritmetico — 356 car (218)
«un'ora è passata solo se è minore di ADESSO».
**In codice:** è già `[ADESSO È: ...]` iniettato nel messaggio; il confronto lo fa il codice.

---

## C · Devono restare parole

Non tutto si può meccanizzare, e forzarlo peggiorerebbe le cose. Restano nel prompt:

- **§4.16 nomi di posti** — «Meraviglioso Polignano a Mare» non si accorcia a «Polignano».
  È interpretazione del linguaggio, non una regola.
- **§4.21 / §4.21b disambiguazione** — Cala Ponte vs Cala Ponte Hotel, fuzzy match ambiguo.
  La regola vera è «in dubbio chiedi», e il dubbio lo riconosce solo il modello.
- **§4.18 rilevamento modifica** — euristica a indizi.
- **§4.29 AM/PM dal contesto volo** — ragionamento su plausibilità.
- **§4.27 eredita dai turni precedenti** — comportamento conversazionale.
- **§4.30 vCard → ospite del transfer** — collegamento fra turni.
- **§10.x casi speciali** — tour vs tratte secche, pax ≥ 8.
- **Tono e velocità.**

---

## Ordine di lavoro

1. **A — cancellazione secca.** 5.284 caratteri, zero rischio, si misura subito: il
   comportamento non deve cambiare di una virgola, perché quelle regole erano già garantite.
2. **B5, B9, B10, B3** — aritmetica pura. Banco offline, nessun giudizio in mezzo.
3. **B1, B7, B4** — whitelist e normalizzatori: fermano scritture sbagliate sul gestionale.
4. **B2, B6, B8** — i più delicati, uno alla volta, ognuno col suo banco.

Ogni passo: banco prima, pubblicazione dopo, e un confronto fra la risposta di prima e
quella di dopo sugli stessi messaggi veri.
