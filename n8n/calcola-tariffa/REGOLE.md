# Calcola Tariffa Prenotazioni — le regole, come sono davvero

Workflow n8n `APv3ZqEizY1HnPia`, attivo, 10 nodi. Sotto-workflow: lo si chiama, non parte da solo.
Riceve `da`, `per`, `pax`, `veicolo`, `fornitore`, `orario`, `row`.

Questo documento è **letto dal codice vivo il 19/08/2026**, nodo per nodo. Non è un ricordo: le
regole del prezzo non erano scritte da nessuna parte in questo repo, e quindi esistevano solo
dentro il codice. Adesso stanno anche qui.

Le costanti, tutte in `Calcola Tariffa`:

```
RATE     = 2,00 €     ROAD  = 1,3 (fattore strada su distanza in linea d'aria)
SOGLIA   = 5 km       MINIMO = 30 €      EURO_KM = 1,00 €/km
garage   = Polignano a Mare (40.9942, 17.2217)
```

## 1. I due luoghi → un comune

`Prepara Ricerche` risolve **Da** e **Per**, in quest'ordine di priorità:

1. **coordinate scritte nel testo** (`40.952,17.296`) — accettate solo se cadono in Italia
2. **link Google Maps** → segue il redirect, estrae le coordinate, e fra tutte quelle plausibili
   sceglie **la più vicina alla Puglia** (40.8, 17.2)
3. **match diretto** su una tabella fissa: aeroporti Bari, Brindisi, Roma, Napoli; stazioni Bari,
   Lecce, Brindisi, Polignano
4. **geocodifica per nome** (sotto-workflow `Risolvi Luogo`, `B1jaBroC20KIiibN`)

Poi Nominatim (reverse) trasforma le coordinate nel **comune**. Restano in mano quattro cose per
capo: nome scritto, nome risolto, comune, coordinate.

## 2. Quale listino

`Leggi Fornitori` → foglio **`Fornitori e strutture`** del gestionale
(`1nqmt8_4Oy8paHlPU8LTBLEvl-quW0DYgTtmB73nBxPw`).

- riga del fornitore: prima match **esatto**, poi `includes` **nei due sensi**
- veicolo tuk-tuk / ape / calessino → colonna **Listini Tuk-tuk**, altrimenti **Listino auto/minivan**
- fornitore non trovato → riga **Generico**; se manca pure quella, se ne costruisce una al volo
- dalla riga si prendono anche **% fee** e **€/min**

## 3. Quale colonna di prezzo

Le colonne del listino con intestazione **numerica** sono le soglie pax (es. `3`, `6`, `8`).

- pax ≤ prima soglia → prima colonna
- pax ≤ seconda soglia → seconda colonna
- altrimenti → **terza colonna**, se c'è; se non c'è → `warning: pax-oltre-listino`

## 4. Il prezzo: la cascata

Per **ognuno** dei due capi (Da e Per):

1. **Esatto** — il nome scritto (o quello risolto) è una riga `Destinazione` del listino → si
   prende quel prezzo.
2. **Comune + raggio** — non c'è la riga esatta, ma c'è il **comune**: si prende il prezzo del
   comune e ci si aggiunge il supplemento per quanto il punto è lontano **dal centro** di quel
   comune:

   ```
   km ≤ 5      → supplemento 0
   km > 5      → supplemento = arrotonda( (km − 5) × 1,3 × 2,00 € )
   ```

   È la regola del «luogo specifico»: la masseria fuori paese costa il paese più la strada in più.

**prezzoBase = il PIÙ ALTO dei due capi** (`MAX(Da, Per)`), non la somma.

3. **Nessuno dei due capi è nel listino** → si passa ai **km dal garage**, ma solo se ci sono
   tutte e quattro le coordinate:

   ```
   km = (garage → Da) + (Da → Per) + (Per → garage), ognuno × 1,3
   base = MAX( arrotonda(km × 1,00 €) , 30 € )
   ```

4. Niente listino e niente coordinate → `warning: nessun-match`, tariffa **0**.

## 5. Gli aggiustamenti finali

```
notturno: orario prima delle 07:00 → × 1,2
ore extra: €/min × minuti
tariffa = arrotonda( base × notturno + extra )
```

In uscita ci sono sia `tariffaListino` sia `tariffaKm`, più `matchEsatto`, il listino usato e il
dettaglio: da dove viene il numero si può sempre vedere.

---

# Cosa NON funziona come dice di funzionare

Letto il 19/08. Sono tutte cose sui **soldi**: 🔴 rossa, quindi qui sono solo scritte. Nessuna è
stata toccata.

### 1. Il ripescaggio su «Generico» non avviene

`Trova Listino` prepara di proposito un secondo tentativo:

> *«se listino primario != Generico → aggiungi Generico come 2° tentativo, così Calcola Tariffa,
> se non trova la destinazione nel listino primario, può ripescare da Generico»*

Il foglio Generico **viene letto davvero**, ma `Calcola Tariffa` costruisce l'elenco delle tratte
**solo dal listino primario** (la variabile `prim`, che si ferma appena il `row_number` riparte da
capo). Le righe del Generico finiscono in memoria e non le guarda nessuno.

**Effetto:** destinazione assente dal listino del fornitore → non si ripesca niente, si va dritti
ai km dal garage. Che è una tariffa diversa, e più bassa quasi sempre.

### 2. Le ore extra non si pagano mai — due volte

- `Prepara Ricerche` costruisce il pacchetto con `row, da, per, pax, veicolo, fornitore, orario`:
  **`hextra` non c'è**. `Calcola Tariffa` legge `ctx.hextra`, che è sempre vuoto → minuti = 0.
- E anche se ci fosse: `Trova Listino` **calcola** `euroMin` dalla riga del fornitore ma **non lo
  mette** nell'oggetto che passa avanti (lo mette solo, a zero, nella riga Generico). Quindi
  `€/min` letto da `Calcola Tariffa` è sempre 0.

**Effetto:** `extra` è sempre 0. La colonna €/min del foglio Fornitori, oggi, non serve a niente.

### 3. La `% fee` si legge e si butta

`extraFeeOraria` viene estratta dalla riga del fornitore e passata avanti. In `Calcola Tariffa`
non compare in nessun conto.

### 4. Il supplemento dal centro vale solo per 18 comuni

La tabella dei centri è **fissa dentro il codice**: Bari, Bari Airport, Brindisi, Brindisi
Airport, Conversano, Monopoli, Polignano, Alberobello, Ostuni, Fasano, Castellana Grotte, Cozze,
Mola di Bari, Martina Franca, Locorotondo, Cisternino, Lecce.

Un comune fuori da questa lista (Savelletri, Torre Canne, Carovigno, Putignano, Noci…) → la
funzione torna **supplemento 0**, in silenzio. La masseria fuori paese costa come il paese.

### 5. Se il calcolo va in errore, non risponde nessuno

Il nodo `IF Errore`: quando l'errore c'è, il ramo «vero» **non è collegato a niente**. Errori
possibili: `Da/Per mancanti`, `Colonna Fornitori non trovata`, `Colonna Listino non trovata`.

**Effetto:** in quei casi il workflow non restituisce né un prezzo né un messaggio. Chi ha
chiamato riceve il vuoto — che è esattamente il tipo di silenzio che qui non si vuole.

### 6. Il fornitore si cerca anche «per somiglianza»

Match esatto, poi `includes` nei due sensi: `«Musae»` aggancia il primo fra «Musae al Mare» e
«Musae Relais & SPA» che capita nell'ordine del foglio. Sui listini, prendere quello dell'altra
struttura è un errore che non si vede.

### 7. Pietra Blu: il calcolatore non risponde mai — **tariffa 0 su ogni corsa**

Il più grosso, e si vede solo mettendo insieme codice e dati. Le colonne di prezzo vengono
riconosciute solo se l'intestazione è **un numero secco** (`/^\d+$/`). Le intestazioni vere:

| listino | intestazioni | il codice le vede? |
|---|---|---|
| Generico, Melograno, Cala Ponte, Puglia Mare, La Peschiera, Antico Mondo… | `2` `7` `9` | sì |
| Auraterrae | `7` `9` | sì (un 1 pax paga la colonna 7) |
| Tuo Hotel, Longo, Sparano, De Napoli | `2` `7` | sì |
| Viator | `8` | sì |
| **Pietra Blu** | **`≤ 2 pax`  `> 3 pax`** | **NO → `no-colonne-prezzo` → tariffa 0** |

Provato sul banco con le corse vere di Pietra Blu: `status: warning`, `tariffa: 0`, sempre.
Si sistema in due modi — o si rinominano le due colonne del listino in `2` e `3`, oppure il
codice impara a leggere il numero dentro l'intestazione (è la correzione provata in
`calcola-tariffa-CORRETTO.js`, che tiene anche il senso di «>»: da lì in su).

### 8. La colonna «Listini Tuk-tuk» non contiene listini

Su 1028 righe di `Fornitori e strutture`, la colonna C contiene **numeri** (1.0, 1.3, 0.8, 0.59)
per 98 fornitori, ed è vuota per 916. **Un solo fornitore ha un nome di listino: Puglia Mare**
(«Puglia Mare Tuk-tuk»). Il codice usa quel valore **come nome di foglio**: per chiunque altro
chieda un tuk-tuk cercherebbe un foglio chiamato «1.3» → non lo trova → nessun listino.

Stessa cosa per due righe (Ave Italia Tours, Gtours) che come **listino auto/minivan** hanno il
numero `1291`.

### 9. La colonna «€/min» è vuota per tutti

Vuota su 992 righe, `0` su 35, e vale `1.0` solo per Puglia Mare. Quindi anche riparando la
tubatura del punto 2, le ore extra resterebbero a zero finché la colonna non si riempie.

### 10. Il nome del file in `CLAUDE.md` era sbagliato — corretto

Il file `1nqmt8_…` si chiama davvero **«Programma Autisti 2.0»** (verificato su Drive il 19/08);
`Prenotazioni NCC 3.0` è il nome della **scheda** dentro. n8n aveva ragione, `CLAUDE.md` no:
l'ho corretto lì.


---

# Il banco: cosa dice il calcolatore sulle corse vere

`node banchi/te/banco-tariffa.js` — gira il **codice vero** dei due nodi
(`calcola-tariffa.js`, `trova-listino.js`, copiati verbatim) sui **listini veri** del gestionale
e su **corse vere** prese dal foglio Strutture, ognuna con la tariffa incassata davvero.

| corsa | pax | incassato | calcolatore oggi |
|---|---|---|---|
| Auraterrae → Ostuni | 2 | 120 € | 120 € |
| Monopoli → Melograno | 2 | 35 € | 30 € |
| Auraterrae → Monopoli | 4 | 60 € | 60 € |
| **Pietra Blu → Alberobello** | 2 | 100 € | **0 € — non risponde** |
| Polignano → APT di Bari | 2 | 110 € | 120 € |
| Melograno → Polignano | 7 | 70 € | 55 € |
| Auraterrae → APT di Bari (07:00) | 1 | 130 € | 130 € |
| Grotte di Castellana → Polignano | 2 | 60 € | 60 € |
| Polignano → Sabbiadoro | 4 | 50 € | 65 € |
| Stazione di Bari → Melograno | 2 | 150 € | 115 € |
| Peschiera → Monopoli | 1 | 50 € | 40 € |
| Auraterrae → San Vito | 2 | 40 € | 40 € |
| **Pietra Blu → San Vito** | 2 | 0 € | **0 € — non risponde** |

Le differenze fra «incassato» e «calcolatore» non sono tutte errori del calcolatore: molte sono
prezzi decisi a mano, sconti, accordi. Ma **cinque casi su tredici** hanno uno scarto, e su due
il calcolatore non risponde affatto: è il conto che vale la pena guardare riga per riga insieme.

**Una nota onesta sul ripescaggio (punto 1):** sulle tredici corse vere del banco non cambia mai
il prezzo finale. È un guasto vero — il Generico si legge e si butta, provato — ma morde solo
quando **nessuno** dei due capi è nel listino del fornitore. Non è quindi urgente come il punto 7.
